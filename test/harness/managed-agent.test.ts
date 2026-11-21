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
};

/** The seat's Agent Instructions, as assembled by the Match. */
const INSTRUCTIONS = "# How to play\n\nPlay to win. Trust nobody.";

const request = (actionKind: string, prompt: string): TurnRequest => ({ seat: 3, actionKind, legalTargets: [1, 2], prompt });
const input = (text: string, actionKind = "vote", extra: Partial<TurnInput> = {}): TurnInput => ({
  text,
  turn: request(actionKind, `Call ${actionKind}.`),
  firstTurn: false,
  ...extra,
});

/** One seat driven like the Player DO drives it. */
async function seat(opts: { hangCancels?: boolean } = {}) {
  const api = new StubInteractionsApi();
  api.hangCancels = !!opts.hangCancels;
  const harness: Harness = managedAgentHarness({ apiKey: "test-key", fetch: api.fetch });
  const ctx: PlayerContext = { matchId: "m1", seat: 3, agent: AGENT, tools: TOOLS, instructions: INSTRUCTIONS, chain: {} };
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
      const r = await harness.cancel!(ctx, h);
      ctx.chain = r?.chain ?? ctx.chain;
      return r?.usage;
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
  it("provisions a fresh environment with the seat's tools and returns its IDs before any cancel request", async () => {
    // Even if every cancel hangs, provisioning returns the setup interaction and environment IDs.
    const { api, ctx } = await seat({ hangCancels: true });
    const [setup] = api.creates();
    expect(setup.environment).toMatchObject({ type: "remote" });
    expect(setup.tools.map((t: any) => t.name)).toEqual(["speak", "vote"]);
    expect(api.requests.some((r) => r.path.endsWith("/cancel"))).toBe(false);
    expect(api.requests.every((r) => r.apiKey === "test-key")).toBe(true);
    expect(ctx.chain.environment).toBe("env-1");
    expect(JSON.stringify(ctx.chain)).toContain(api.latest().id);
  });

  it("cancels the setup interaction when the first turn starts, before creating the turn", async () => {
    const s = await seat();
    const setupId = s.api.latest().id;
    await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    expect(s.api.interactions.get(setupId)!.status).toBe("cancelled");
    const cancelAt = s.api.requests.findIndex((r) => r.path === `/${setupId}/cancel`);
    const turnAt = s.api.requests.findLastIndex((r) => r.method === "POST" && r.path === "");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeLessThan(turnAt);
    // Only once.
    await s.start(input("NEXT", "vote"));
    expect(s.api.requests.filter((r) => r.path === `/${setupId}/cancel`)).toHaveLength(1);
  });

  it("mounts the seat's Agent Instructions as /.agents/AGENTS.md in the new environment", async () => {
    const { api } = await seat();
    const [setup] = api.creates();
    expect(setup.environment).toEqual({
      type: "remote",
      sources: [{ type: "inline", target: "/.agents/AGENTS.md", content: INSTRUCTIONS }],
    });
  });

  it("provisions a plain environment when the seat has no Agent Instructions", async () => {
    const api = new StubInteractionsApi();
    const harness = managedAgentHarness({ apiKey: "test-key", fetch: api.fetch });
    await harness.provision({ matchId: "m1", seat: 3, agent: AGENT, tools: TOOLS, chain: {} });
    expect(api.creates()[0].environment).toBe("remote");
  });

  it("sends the rules and the seat's fixed tools on the first turn, on the provisioned environment, but not the mounted instructions", async () => {
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
    expect(body.input).not.toContain("Play to win. Trust nobody.");
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

    // The Match repeats every event since the seat's last answered turn.
    const h = await s.start(input("MISSED: Seat 2 spoke.\nNEW: Seat 1 spoke. Call vote."));
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBe(parent);
    expect(body.input[0]).toMatchObject({ type: "function_result", call_id: parentCallId });
    const result = JSON.stringify(body.input[0].result);
    expect(result.split("MISSED: Seat 2 spoke.").length - 1).toBe(1);
    expect(result).toContain("NEW: Seat 1 spoke.");
    expect(result).toContain("deadline");
    s.api.callTool(s.api.latest().id, "vote", { target: 1 });
    expect(await s.poll(h)).toEqual({ status: "done", call: { name: "vote", args: { target: 1 } } });
  });

  it("after a first-turn timeout, starts a fresh chain on the same environment with a full catch-up, and the seat acts", async () => {
    const s = await seat();
    const first = await s.start(input("BRIEFING-1: rules, role, seats. Night 1 events.", "vote", { firstTurn: true }));
    await s.cancel(first);

    // The Match sends the briefing again with a catch-up of everything so far.
    const h = await s.start(
      input("BRIEFING-1: rules, role, seats. Night 1 events.\nNEW: Day 1 events. Call speak.", "speak", { firstTurn: true }),
    );
    const body = s.api.creates().at(-1);
    expect(body.previous_interaction_id).toBeUndefined();
    expect(body.environment).toBe("env-1");
    expect(body.input).not.toContain("Play to win. Trust nobody.");
    expect(body.input).toContain("BRIEFING-1: rules, role, seats. Night 1 events.");
    expect(body.input).toContain("NEW: Day 1 events.");
    expect(body.input.split("BRIEFING-1").length - 1).toBe(1);
    expect(body.input).toContain("deadline");
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
    await s.start(input("MISSED-A\nNEW-B"));
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

  it("keeps the chain on a transient 429 from a continuation, so the Player DO can retry the turn", async () => {
    const s = await seat();
    const parent = await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    s.api.failNextCreate = 429;
    await expect(s.start(input("NEW-B", "speak"))).rejects.toThrow(/429/);
    await s.start(input("NEW-B", "speak"));
    expect(s.api.creates().at(-1).previous_interaction_id).toBe(parent);
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

describe("Managed Agent harness: usage", () => {
  const U1 = { input: 5000, cached: 1200, thought: 300, output: 40 };
  const U2 = { input: 7000, cached: 4000, thought: 90, output: 25 };

  it("returns the interaction's usage with the turn result, keyed by interaction ID and model", async () => {
    const s = await seat();
    const h = await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    const id = s.api.latest().id;
    s.api.callTool(id, "vote", { target: 2 });
    s.api.bill(id, U1);
    expect(await s.poll(h)).toEqual({
      status: "done",
      call: { name: "vote", args: { target: 2 } },
      usage: [{ id, model: "gemini-4-hydrogen", usage: U1 }],
    });
  });

  it("counts a cancelled (timed-out) interaction's usage, from the cancel response or else when the next turn reads it", async () => {
    const s = await seat();
    await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    // Usage already on the cancel response.
    const h1 = await s.start(input("OBS-1", "speak"));
    const id1 = String(h1.interactionId);
    s.api.bill(id1, U1);
    expect(await s.cancel(h1)).toEqual([{ id: id1, model: "gemini-4-hydrogen", usage: U1 }]);
    // Usage visible only after the cancel: the next turn's start reads it.
    const h2 = await s.start(input("OBS-2", "speak"));
    const id2 = String(h2.interactionId);
    s.api.billOnCancel.set(id2, { total_input_tokens: 7000, total_cached_tokens: 4000, total_thought_tokens: 90, total_output_tokens: 25 });
    expect(await s.cancel(h2)).toBeUndefined();
    const next = await s.harness.startTurn(s.ctx, input("OBS-3"));
    expect(next.usage).toContainEqual({ id: id2, model: "gemini-4-hydrogen", usage: U2 });
  });

  it("on close, cancels and bills the setup interaction of a seat that never took a turn, once", async () => {
    const s = await seat();
    const setupId = s.api.latest().id;
    s.api.billOnCancel.set(setupId, { total_input_tokens: 900, total_cached_tokens: 0, total_thought_tokens: 10, total_output_tokens: 0 });
    const closed = await s.harness.close!(s.ctx);
    expect(s.api.interactions.get(setupId)!.status).toBe("cancelled");
    expect(closed!.usage).toEqual([{ id: setupId, model: "gemini-4-hydrogen", usage: { input: 900, cached: 0, thought: 10, output: 0 } }]);
    expect(await s.harness.close!({ ...s.ctx, chain: closed!.chain! })).toBeUndefined();
  });

  it("on close, reads the seat's last interaction again, so usage missed at cancel time still counts", async () => {
    const s = await seat();
    await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    const h = await s.start(input("OBS", "speak"));
    const id = String(h.interactionId);
    expect(await s.cancel(h)).toBeUndefined(); // no usage visible at cancel time
    s.api.bill(id, U2);
    const closed = await s.harness.close!(s.ctx);
    expect(closed!.usage).toEqual([{ id, model: "gemini-4-hydrogen", usage: U2 }]);
  });

  it("keeps a setup interaction whose usage was not readable at cancel time, and reads it on close", async () => {
    const s = await seat();
    const setupId = s.api.latest().id;
    const started = await s.harness.startTurn(s.ctx, input("BRIEFING-1", "vote", { firstTurn: true }));
    expect(started.usage).toBeUndefined();
    s.ctx.chain = started.chain;
    s.api.bill(setupId, { input: 900, cached: 0, thought: 10, output: 0 });
    const closed = await s.harness.close!(s.ctx);
    expect(closed!.usage).toContainEqual({ id: setupId, model: "gemini-4-hydrogen", usage: { input: 900, cached: 0, thought: 10, output: 0 } });
  });

  it("reports the setup interaction's usage when the first turn cancels it", async () => {
    const s = await seat();
    const setupId = s.api.latest().id;
    s.api.bill(setupId, { input: 900, cached: 0, thought: 10, output: 0 });
    const started = await s.harness.startTurn(s.ctx, input("BRIEFING-1", "vote", { firstTurn: true }));
    expect(started.usage).toEqual([{ id: setupId, model: "gemini-4-hydrogen", usage: { input: 900, cached: 0, thought: 10, output: 0 } }]);
  });

  it("reports a superseded interaction's usage when the next turn settles it", async () => {
    const s = await seat();
    await s.act(input("BRIEFING-1", "vote", { firstTurn: true }), "vote", { target: 2 });
    const stale = await s.start(input("MISSED-A", "speak"));
    const staleId = String(stale.interactionId);
    s.api.bill(staleId, U1);
    const started = await s.harness.startTurn(s.ctx, input("MISSED-A\nNEW-B"));
    expect(started.usage).toEqual([{ id: staleId, model: "gemini-4-hydrogen", usage: U1 }]);
  });

  it("bills the harness's default model when the Agent names none", async () => {
    const api = new StubInteractionsApi();
    const harness = managedAgentHarness({ apiKey: "test-key", fetch: api.fetch });
    const ctx: PlayerContext = { matchId: "m1", seat: 3, agent: { ...AGENT, model: undefined }, tools: TOOLS, chain: {} };
    ctx.chain = await harness.provision(ctx);
    const started = await harness.startTurn(ctx, input("BRIEFING-1", "vote", { firstTurn: true }));
    ctx.chain = started.chain;
    const id = api.latest().id;
    api.complete(id);
    api.bill(id, U1);
    expect(await harness.poll(ctx, started.handle)).toMatchObject({ usage: [{ id, model: "gemini-4-hydrogen", usage: U1 }] });
  });

  it("returns no usage field when the API reports none", async () => {
    const s = await seat();
    const h = await s.start(input("BRIEFING-1", "vote", { firstTurn: true }));
    s.api.complete(s.api.latest().id);
    expect(await s.poll(h)).toEqual({ status: "done", call: null });
  });
});
