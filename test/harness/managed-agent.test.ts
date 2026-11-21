// Managed Agent harness against a stubbed Interactions API (never the real one).
// Each test plays one seat the way the Player DO does: keep the chain the
// harness returns, start turns, poll them, and (on a deadline) cancel them.

import { describe, expect, it } from "vitest";
import type { AgentConfig, Harness, PlayerContext, TurnHandle, TurnInput } from "../../src/core/harness";
import type { ToolSpec, TurnRequest } from "../../src/core/ruleset";
import { managedAgentHarness } from "../../src/harness/managed-agent";
import { inputText, StubInteractionsApi } from "./stub-interactions-api";

const TOOLS: ToolSpec[] = [
  { name: "speak", description: "Speak.", parameters: { type: "object", properties: { text: { type: "string" } } } },
  { name: "vote", description: "Vote.", parameters: { type: "object", properties: { target: { type: "integer" } } } },
];

const AGENT: AgentConfig = {
  id: "hydrogen",
  name: "Hydrogen",
  harness: "managed-agent",
  model: "gemini-4-hydrogen",
  instructions: "Play to win. Trust nobody.",
};

const request = (actionKind: string, prompt: string): TurnRequest => ({ seat: 3, actionKind, legalTargets: [1, 2], prompt });
const input = (text: string, actionKind = "vote", extra: Partial<TurnInput> = {}): TurnInput => ({
  text,
  turn: request(actionKind, `Call ${actionKind}.`),
  firstTurn: false,
  ...extra,
});

/** One seat driven like the Player DO drives it. */
async function seat(opts: { now?: () => number; maxTurnMs?: number } = {}) {
  const api = new StubInteractionsApi();
  const harness: Harness = managedAgentHarness({ apiKey: "test-key", fetch: api.fetch, ...opts });
  const ctx: PlayerContext = { matchId: "m1", seat: 3, agent: AGENT, tools: TOOLS, chain: {} };
  ctx.chain = await harness.provision(ctx);
  const s = {
    api,
    harness,
    ctx,
    async start(i: TurnInput): Promise<TurnHandle> {
      const started = await harness.startTurn(ctx, i);
      ctx.chain = started.chain;
      return started.handle;
    },
    poll: (h: TurnHandle) => harness.poll(ctx, h),
    async cancel(h: TurnHandle) {
      ctx.chain = await harness.cancel!(ctx, h);
    },
    /** Start a turn and have the Agent answer it with a call. Returns the interaction ID. */
    async act(i: TurnInput, name: string, args: Record<string, unknown>) {
      const h = await s.start(i);
      const id = api.latest().id;
      api.callTool(id, name, args);
      expect(await s.poll(h)).toMatchObject({ status: "done", call: { name, args } });
      return id;
    },
  };
  return s;
}

describe("Managed Agent harness: provisioning and the first turn", () => {
  it("provisions a fresh environment at Match start with the seat's tools, then cancels the setup interaction", async () => {
    const { api, ctx } = await seat();
    const [setup] = api.creates();
    expect(setup.environment).toBe("remote");
    expect(setup.tools.map((t: any) => t.name)).toEqual(["speak", "vote"]);
    expect(api.requests.some((r) => r.path === `/${api.latest().id}/cancel`)).toBe(true);
    expect(api.requests.every((r) => r.apiKey === "test-key")).toBe(true);
    expect(ctx.chain.environment).toBe("env-1");
  });

  it("sends rules, Agent Instructions and the seat's fixed tools on the first turn, on the provisioned environment", async () => {
    const s = await seat();
    await s.start(input("RULES. You are seat 3. Seats: 1, 2, 3.\n\nNight 1: call vote.", "vote", { firstTurn: true }));
    const body = s.api.creates().at(-1);
    expect(body).toMatchObject({
      agent: "antigravity-preview-09-2026",
      agent_config: { type: "antigravity", model: "gemini-4-hydrogen", max_total_tokens: 100_000 },
      environment: "env-1",
      background: true,
      store: true,
    });
    expect(body.previous_interaction_id).toBeUndefined();
    expect(body.tools).toEqual(TOOLS.map((t) => ({ type: "function", ...t })));
    expect(body.input).toContain("Play to win. Trust nobody.");
    expect(body.input).toContain("RULES. You are seat 3.");
  });

  it("returns the interaction ID in the handle and chain before any polling happens", async () => {
    const s = await seat();
    const handle = await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    const id = s.api.latest().id;
    expect(handle.interactionId).toBe(id);
    expect(JSON.stringify(s.ctx.chain)).toContain(id);
    expect(s.api.requests.some((r) => r.method === "GET" && r.path === `/${id}`)).toBe(false);
  });
});

describe("Managed Agent harness: polling", () => {
  it("is pending while the interaction runs, then returns the custom call, ignoring filesystem calls", async () => {
    const s = await seat();
    const h = await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    expect(await s.poll(h)).toMatchObject({ status: "pending" });
    s.api.callTool(s.api.latest().id, "vote", { target: 2 }, { filesystemFirst: true });
    expect(await s.poll(h)).toEqual({ status: "done", call: { name: "vote", args: { target: 2 } } });
  });

  it("reports no call when the Agent ends its turn without calling a game tool", async () => {
    const s = await seat();
    const h = await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    s.api.complete(s.api.latest().id);
    expect(await s.poll(h)).toEqual({ status: "done", call: null });
  });
});

describe("Managed Agent harness: continuations", () => {
  it("chains the next turn, answering the previous call with the new observation and resending identical tools", async () => {
    const s = await seat();
    const first = await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    const firstCallId = s.api.interactions.get(first)!.steps.at(-1).id;
    await s.start(input("Seat 2 was eliminated. Day 2: call speak.", "speak"));
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBe(first);
    expect(body.environment).toBe("env-1");
    expect(body.tools).toEqual(s.api.creates()[1].tools);
    expect(body.input).toHaveLength(1);
    expect(body.input[0]).toMatchObject({ type: "function_result", name: "vote", call_id: firstCallId });
    expect(JSON.stringify(body.input[0].result)).toContain("Seat 2 was eliminated.");
    // The continuation carries only the new observation, not the first turn again.
    expect(inputText(body)).not.toContain("BRIEFING-1");
  });
});

describe("Managed Agent harness: out-of-phase calls", () => {
  it("answers an out-of-phase call with an error function_result naming the required action, and the Agent recovers", async () => {
    const s = await seat();
    const turn = input("BRIEFING-1\n\nNight 1: call vote.", "vote", { firstTurn: true });
    const bad = await s.act(turn, "speak", { text: "hello" });
    const badCallId = s.api.interactions.get(bad)!.steps.at(-1).id;
    // The Match rejected it; the Player DO retries the same frozen observation with the error.
    const error = "speak is not allowed now. Required action: vote with target one of 1, 2.";
    const h = await s.start({ ...turn, error });
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBe(bad);
    expect(body.input[0]).toMatchObject({ type: "function_result", name: "speak", call_id: badCallId });
    expect(body.input[0].result).toMatchObject({ accepted: false, error });
    expect(inputText(body)).not.toContain("BRIEFING-1");
    s.api.callTool(s.api.latest().id, "vote", { target: 1 });
    expect(await s.poll(h)).toEqual({ status: "done", call: { name: "vote", args: { target: 1 } } });
  });
});

describe("Managed Agent harness: timeout recovery", () => {
  it("after a continuation timeout, answers the still-pending parent call with every missed observation, and the seat acts", async () => {
    const s = await seat();
    const parent = await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    const parentCallId = s.api.interactions.get(parent)!.steps.at(-1).id;
    const timedOut = await s.start(input("MISSED: Seat 2 spoke. Call speak.", "speak"));
    await s.cancel(timedOut); // deadline passed
    expect(s.api.interactions.get(String(timedOut.interactionId))!.status).toBe("cancelled");

    const h = await s.start(input("NEW: Seat 1 spoke. Call vote."));
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBe(parent);
    expect(body.input[0]).toMatchObject({ type: "function_result", call_id: parentCallId });
    const result = JSON.stringify(body.input[0].result);
    expect(result).toContain("MISSED: Seat 2 spoke.");
    expect(result).toContain("NEW: Seat 1 spoke.");
    expect(result).toContain("deadline");
    s.api.callTool(s.api.latest().id, "vote", { target: 1 });
    expect(await s.poll(h)).toEqual({ status: "done", call: { name: "vote", args: { target: 1 } } });
  });

  it("after a first-turn timeout, starts a fresh chain on the same environment with a full catch-up, and the seat acts", async () => {
    const s = await seat();
    const first = await s.start(input("BRIEFING-1: rules, role, seats. Night 1 events.", "vote", { firstTurn: true }));
    await s.cancel(first);

    const h = await s.start(input("NEW: Day 1 events. Call speak.", "speak"));
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBeUndefined();
    expect(body.environment).toBe("env-1");
    expect(body.input).toContain("Play to win. Trust nobody.");
    expect(body.input).toContain("BRIEFING-1: rules, role, seats. Night 1 events.");
    expect(body.input).toContain("NEW: Day 1 events.");
    s.api.callTool(s.api.latest().id, "speak", { text: "hi" });
    expect(await s.poll(h)).toEqual({ status: "done", call: { name: "speak", args: { text: "hi" } } });

    // The fresh chain continues normally from there.
    await s.start(input("NEXT. Call vote."));
    expect(s.api.creates().at(-1).previous_interaction_id).toBe(String(h.interactionId));
  });

  it("recovers the same way when a new turn arrives while the previous one is still running (no explicit cancel)", async () => {
    const s = await seat();
    const parent = await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    const stale = await s.start(input("MISSED-A", "speak"));
    await s.start(input("NEW-B"));
    expect(s.api.interactions.get(String(stale.interactionId))!.status).toBe("cancelled");
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBe(parent);
    expect(JSON.stringify(body.input)).toContain("MISSED-A");
    expect(JSON.stringify(body.input)).toContain("NEW-B");
  });

  it("restarts the chain on the same environment with a catch-up when a continuation is rejected", async () => {
    const s = await seat();
    await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    s.api.failNextCreate = 400;
    await s.start(input("NEW-B", "speak"));
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBeUndefined();
    expect(body.environment).toBe("env-1");
    expect(body.input).toContain("BRIEFING-1");
    expect(body.input).toContain("NEW-B");
  });

  it("cancels a turn stuck past the watchdog limit and reports an error, not a call", async () => {
    let t = 0;
    const s = await seat({ now: () => t, maxTurnMs: 1000 });
    const h = await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    t = 1500;
    expect(await s.poll(h)).toMatchObject({ status: "error" });
    expect(s.api.interactions.get(String(h.interactionId))!.status).toBe("cancelled");
  });
});

describe("Managed Agent harness: late results", () => {
  it("never returns the call of an interaction that was cancelled, even if it landed before the cancel", async () => {
    const s = await seat();
    const parent = await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    const late = await s.start(input("OBS-A", "speak"));
    const lateId = String(late.interactionId);
    s.api.callTool(lateId, "speak", { text: "too slow" }); // lands just as the deadline passes
    await s.cancel(late);
    expect(await s.poll(late)).toMatchObject({ status: "error" });

    // The next turn answers the late call (it is the pending one) and says it was not used.
    await s.start(input("OBS-B"));
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBe(lateId);
    expect(body.previous_interaction_id).not.toBe(parent);
    expect(body.input[0].result).toMatchObject({ accepted: false });
    const result = JSON.stringify(body.input[0].result);
    expect(result).toContain("not used");
    expect(result).toContain("OBS-B");
    expect(result).not.toContain("OBS-A"); // the late interaction already saw it
  });

  it("does not return a call for a handle that is no longer the seat's current turn", async () => {
    const s = await seat();
    const old = await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    s.api.callTool(String(old.interactionId), "vote", { target: 1 });
    await s.cancel(old);
    await s.start(input("OBS-B"));
    expect(await s.poll(old)).toMatchObject({ status: "error" });
  });
});
