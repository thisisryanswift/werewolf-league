import { describe, expect, it } from "vitest";
import type { Harness, PlayerContext } from "../../src/core/harness";
import type { ToolCall } from "../../src/core/ruleset";
import { PI_HARNESS_ID, piHarness, SWEEP_AGE_MS, sweepSandboxes, type PiSeatClient } from "../../src/harness/pi";
import type { PiPoll, PiSeatConfig } from "../../src/harness/pi/seat";
import { ACCEPTED, handleGameCall, IGNORED, type CheckCall, type PiTurn, type TurnStore } from "../../src/harness/pi/turn";
import { piRoster } from "../../src/rulesets/werewolf/roster";
import { PRICES } from "../../src/core/pricing";

function store(turn?: PiTurn): TurnStore & { value?: PiTurn } {
  const s: TurnStore & { value?: PiTurn } = { value: turn, get: () => s.value, put: (t) => (s.value = t) };
  return s;
}

/** A Match that accepts only `speak` calls with text. */
const check: CheckCall = async (_turnId, call) =>
  call.name === "speak" && typeof call.args.text === "string" ? { ok: true } : { ok: false, error: "Call speak with text." };

const speak = (text: string): ToolCall => ({ name: "speak", args: { text } });

describe("pi game tools (handleGameCall)", () => {
  it("first valid call wins and ends the run", async () => {
    const s = store({ opId: "turn-1", turnId: "m:1:1", accepted: null });
    const r = await handleGameCall(s, "turn-1", speak("hello"), check);
    expect(r).toEqual({ output: [{ type: "text", text: ACCEPTED }], control: { terminate: true } });
    expect(s.value?.accepted).toEqual(speak("hello"));
  });

  it("an invalid call gets the Match's error as an error result, so the model retries in the run", async () => {
    const s = store({ opId: "turn-1", turnId: "m:1:1", accepted: null });
    const r = await handleGameCall(s, "turn-1", { name: "vote", args: {} }, check);
    expect(r).toEqual({ output: [{ type: "text", text: "Call speak with text." }], isError: true });
    expect(s.value?.accepted).toBeNull();
    await handleGameCall(s, "turn-1", speak("retry"), check);
    expect(s.value?.accepted).toEqual(speak("retry"));
  });

  it("extra calls after the first valid one are ignored, including parallel ones", async () => {
    const s = store({ opId: "turn-1", turnId: "m:1:1", accepted: null });
    const [a, b] = await Promise.all([
      handleGameCall(s, "turn-1", speak("first"), check),
      handleGameCall(s, "turn-1", speak("second"), check),
    ]);
    expect(a.output[0]!.text).toBe(ACCEPTED);
    expect(b.output[0]!.text).toBe(IGNORED);
    expect(s.value?.accepted).toEqual(speak("first"));
    const late = await handleGameCall(s, "turn-1", speak("third"), check);
    expect(late.output[0]!.text).toBe(IGNORED);
    expect(s.value?.accepted).toEqual(speak("first"));
  });

  it("calls from a cancelled or superseded run are ignored", async () => {
    const cancelled = store({ opId: "turn-1", turnId: "m:1:1", accepted: null, cancelled: true });
    expect((await handleGameCall(cancelled, "turn-1", speak("x"), check)).output[0]!.text).toBe(IGNORED);
    expect(cancelled.value?.accepted).toBeNull();
    const newer = store({ opId: "turn-2", turnId: "m:2:1", accepted: null });
    expect((await handleGameCall(newer, "turn-1", speak("x"), check)).output[0]!.text).toBe(IGNORED);
    expect(newer.value?.accepted).toBeNull();
  });

  it("asks the Match about the turn's own ID", async () => {
    const seen: string[] = [];
    const s = store({ opId: "turn-3", turnId: "m:7:2", accepted: null });
    await handleGameCall(s, "turn-3", speak("x"), async (turnId) => (seen.push(turnId), { ok: true }));
    expect(seen).toEqual(["m:7:2"]);
  });
});

/** A fake PiSeatDO: answers each run with a scripted poll result. */
function fakeSeat(polls: PiPoll[]) {
  const log: string[] = [];
  let provisioned: PiSeatConfig | undefined;
  const seat: PiSeatClient = {
    async provision(config) {
      provisioned = config;
      log.push("provision");
      return { instance: "inst-1" };
    },
    async startTurn(opId, turnId, text) {
      log.push(`start ${opId} ${turnId} ${text}`);
    },
    async poll(opId) {
      log.push(`poll ${opId}`);
      return polls.shift() ?? { status: "pending" };
    },
    async cancel(opId) {
      log.push(`cancel ${opId}`);
      return { usage: [] };
    },
    async close() {
      log.push("close");
      throw new Error("agent37 down");
    },
  };
  return { seat, log, config: () => provisioned };
}

function ctxOf(chain: Record<string, unknown> = {}): PlayerContext {
  return {
    matchId: "m",
    seat: 2,
    agent: { id: "haiku-pi", name: "Haiku · Pi", harness: PI_HARNESS_ID, model: "anthropic/claude-haiku-5.5" },
    tools: [{ name: "speak", description: "Say something", parameters: { type: "object", properties: { text: { type: "string" } } } }],
    instructions: "Play well.",
    chain,
  };
}

const turn = { actionKind: "speak", legalTargets: [], prompt: "Speak." } as never;
const usage = [{ id: "pi:m:2", model: "anthropic/claude-haiku-5.5", usage: { input: 100, cached: 0, thought: 0, output: 10 } }];

describe("pi Harness adapter", () => {
  it("satisfies the Harness interface: provision, startTurn, poll, cancel, close", async () => {
    const { seat, log, config } = fakeSeat([{ status: "pending" }, { status: "done", call: speak("hi"), usage }]);
    const h: Harness = piHarness(() => seat);
    const chain = await h.provision(ctxOf());
    expect(chain).toMatchObject({ instance: "inst-1", turns: 0 });
    expect(config()).toMatchObject({ matchId: "m", seat: 2, model: "anthropic/claude-haiku-5.5", instructions: "Play well." });

    const started = await h.startTurn(ctxOf(chain), { text: "obs 1", turn, firstTurn: true, turnId: "m:1:2" });
    expect(started.handle).toEqual({ opId: "turn-1" });
    expect(await h.poll(ctxOf(started.chain), started.handle)).toEqual({ status: "pending", handle: started.handle });
    expect(await h.poll(ctxOf(started.chain), started.handle)).toEqual({ status: "done", call: speak("hi"), usage });

    const next = await h.startTurn(ctxOf(started.chain), { text: "obs 2", turn, firstTurn: false, turnId: "m:2:2", error: "bad" });
    expect(next.handle).toEqual({ opId: "turn-2" });
    await h.cancel!(ctxOf(next.chain), next.handle);
    // close never throws, even when the sandbox delete fails: cleanup never blocks the Match.
    const closed = await h.close!(ctxOf(next.chain));
    expect(closed).toMatchObject({ chain: { sandboxDeleted: false } });
    expect(log).toEqual([
      "provision",
      "start turn-1 m:1:2 obs 1",
      "poll turn-1",
      "poll turn-1",
      "start turn-2 m:2:2 obs 2\n\nYour last call was rejected: bad",
      "cancel turn-2",
      "close",
    ]);
  });

  it("reports a model error (run ended unanswered) as a poll error", async () => {
    const { seat } = fakeSeat([{ status: "error", message: "pi run ended unanswered: model_error", usage: [] }]);
    const h = piHarness(() => seat);
    expect(await h.poll(ctxOf(), { opId: "turn-1" })).toEqual({ status: "error", message: "pi run ended unanswered: model_error" });
  });

  it("refuses to start a turn without the Match's turn ID", async () => {
    const h = piHarness(() => fakeSeat([]).seat);
    await expect(h.startTurn(ctxOf(), { text: "x", turn, firstTurn: true })).rejects.toThrow(/turn ID/);
  });
});

describe("pi roster", () => {
  it("is on the pi harness, includes Hydrogen via OpenRouter, and every model is priced", () => {
    const roster = piRoster();
    expect(roster.every((a) => a.harness === PI_HARNESS_ID)).toBe(true);
    expect(roster.map((a) => a.model)).toContain("google/gemini-4-hydrogen");
    for (const a of roster) expect(PRICES[a.model!], a.model).toBeDefined();
  });
});

describe("pi sandbox sweep (League pause)", () => {
  it("deletes only pi sandboxes older than any Match, and never throws", async () => {
    const now = 10_000_000_000;
    const deleted: string[] = [];
    const fakeFetch = async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted.push(url.split("/").pop()!);
        return Response.json({ deleted: true });
      }
      return Response.json({
        data: [
          { id: "old", name: "wl-pi-m1-2", created: (now - SWEEP_AGE_MS - 1000) / 1000 },
          { id: "live", name: "wl-pi-m2-2", created: (now - 60_000) / 1000 },
          { id: "other", name: "someone-else", created: 0 },
        ],
      });
    };
    expect(await sweepSandboxes("k", now, fakeFetch)).toBe(1);
    expect(deleted).toEqual(["old"]);
    const down = async (): Promise<Response> => {
      throw new Error("down");
    };
    expect(await sweepSandboxes("k", now, down)).toBe(0);
    expect(await sweepSandboxes(undefined, now, fakeFetch)).toBe(0);
  });
});
