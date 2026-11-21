// Timeout recovery end to end: the managed-agent harness on the stubbed Interactions
// API, through real Match/Player DOs, alarms and deadlines (the real API is never called).
// Stub Agents read the "Your turn:" line and call the required tool; one Werewolf seat
// stalls on a chosen turn so the Player DO's deadline cancels it.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import { API_BASE } from "../../src/harness/managed-agent/api";
import { StubInteractionsApi } from "../harness/stub-interactions-api";
import { dealtWolves, finished, startMatch, waitFor } from "./helpers";

const deadlines = { turnMs: 400, firstTurnMs: 500, graceMs: 400 };

/** Text the Agent was given in an interaction: the string input, or its function_result observation. */
function given(body: any): string {
  if (typeof body.input === "string") return body.input;
  return (body.input as any[]).map((i) => String(i.result?.observation ?? "")).join("\n");
}

/** The "What happened" lines of an observation (everything but its turn request). */
function happened(text: string): string[] {
  const i = text.lastIndexOf("What happened:");
  if (i < 0) return [];
  return text
    .slice(i + "What happened:".length)
    .split("Your turn:")[0]!
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

interface Turn {
  seat: number;
  id: string;
  body: any;
}

/**
 * A stub API whose Agents answer every turn, except `stallSeat`'s turn number `stallTurn`
 * (1-based), which never answers, or with `late`, answers just as the deadline's cancel lands.
 */
function install(stallSeat: number, stallTurn: number, opts: { late?: boolean } = {}) {
  const api = new StubInteractionsApi();
  const seatOf = new Map<string, number>();
  const turns: Turn[] = [];
  const handled = new Set<string>();

  const act = () => {
    for (const it of api.interactions.values()) {
      if (handled.has(it.id)) continue;
      handled.add(it.id);
      const body = it.body;
      if (typeof body.input === "string" && body.input.includes("Setup only")) continue;
      const seat = body.previous_interaction_id
        ? seatOf.get(body.previous_interaction_id)!
        : Number(/You are \w+ \(seat (\d+)\)\./.exec(body.input)?.[1]);
      seatOf.set(it.id, seat);
      turns.push({ seat, id: it.id, body });
      if (seat === stallSeat && turns.filter((t) => t.seat === seat).length === stallTurn) {
        if (opts.late) api.landOnCancel.set(it.id, { name: "wolf_chat", args: { text: "too late" } });
        continue;
      }
      const text = given(body);
      const ask = text.slice(text.lastIndexOf("Your turn:"));
      const tool = /with (\w+)/.exec(ask)?.[1];
      if (!tool) {
        api.complete(it.id);
        continue;
      }
      const first = /Legal targets: ([^.]+)\./.exec(ask)?.[1]?.split(",")[0]?.trim();
      const target = first === "abstain" ? "abstain" : Number(first);
      api.callTool(it.id, tool, { target, text: `chat from seat ${seat}`, beliefs: {}, reason: "stub" });
    }
  };

  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(API_BASE)) return realFetch(input, init);
    const res = await api.fetch(input, init);
    act();
    return res;
  });
  return { api, turns, of: (seat: number) => turns.filter((t) => t.seat === seat) };
}

// Distinct Agents, so the deal matches dealtWolves(seed).
const agents: AgentConfig[] = Array.from({ length: 7 }, (_, i) => ({
  id: `ma-${i + 1}`,
  name: `MA ${i + 1}`,
  harness: "managed-agent",
  model: "gemini-4-hydrogen",
  instructions: "Stub instructions.",
}));

afterEach(() => vi.restoreAllMocks());

describe("managed-agent timeout recovery through real Match and Player DOs", () => {
  it("after a continuation timeout, the seat's next turn answers the pending parent call with the missed events", async () => {
    const seed = "ma-continuation-timeout";
    const wolf = dealtWolves(seed)[0]!;
    const stub = install(wolf, 2); // turn 1: Wolf Chat 1; turn 2 (Wolf Chat 2) stalls; turn 3: the kill
    const matchId = await startMatch({ seed, agents, deadlines });

    await waitFor(async () => (stub.of(wolf).length >= 3 ? true : null));
    const [first, stalled, next] = stub.of(wolf) as [Turn, Turn, Turn];
    expect(stub.api.interactions.get(stalled.id)!.status).toBe("cancelled");

    // The next turn continues from the first turn and answers its still-pending call.
    expect(next.body.previous_interaction_id).toBe(first.id);
    const firstCall = stub.api.interactions.get(first.id)!.steps.at(-1).id;
    expect(next.body.input[0]).toMatchObject({ type: "function_result", call_id: firstCall });

    // Everything the stalled turn would have shown is in the next turn's observation.
    const missed = happened(given(stalled.body));
    expect(missed.length).toBeGreaterThan(0);
    const observation = given(next.body);
    for (const line of missed) expect(observation).toContain(line);

    // Let the Match finish on the stub, so no Player DO alarm outlives it.
    const snap = await finished(matchId);
    expect(snap.events.some((e) => e.kind === "turn_timed_out" && e.data.seat === wolf)).toBe(true);
  });

  it("after a first-turn timeout, the seat starts a fresh chain on its environment with the briefing and missed events", async () => {
    const seed = "ma-first-turn-timeout";
    const wolf = dealtWolves(seed)[0]!;
    const stub = install(wolf, 1); // the first turn (Wolf Chat 1) stalls
    const matchId = await startMatch({ seed, agents, deadlines });

    await waitFor(async () => (stub.of(wolf).length >= 2 ? true : null));
    const [stalled, next] = stub.of(wolf) as [Turn, Turn];
    expect(stub.api.interactions.get(stalled.id)!.status).toBe("cancelled");

    expect(next.body.previous_interaction_id).toBeUndefined();
    expect(next.body.environment).toBe(stalled.body.environment);
    const input: string = next.body.input;
    // Briefing: rules, role and seats.
    expect(input).toContain("You are playing Werewolf.");
    expect(input).toContain(`(seat ${wolf}). Your secret role: Werewolf.`);
    expect(input).toContain("Seats:");
    expect(input).toContain("Stub instructions.");
    // Missed events: everything the stalled first turn showed, plus the partner's Wolf Chat it missed.
    for (const line of happened(stalled.body.input)) expect(input).toContain(line);
    const partner = dealtWolves(seed).find((w) => w !== wolf)!;
    expect(input).toContain(`chat from seat ${partner}`);
    // The briefing appears once, not once per missed turn.
    expect(input.split("You are playing Werewolf.").length - 1).toBe(1);
    await finished(matchId);
  });

  it("a call that lands as the deadline passes is never applied, and the next turn tells the Agent it was not used", async () => {
    const seed = "ma-late-call";
    const wolf = dealtWolves(seed)[0]!;
    const stub = install(wolf, 2, { late: true }); // Wolf Chat 2 answers only as it is cancelled
    const matchId = await startMatch({ seed, agents, deadlines });

    await waitFor(async () => (stub.of(wolf).length >= 3 ? true : null));
    const [, late, next] = stub.of(wolf) as [Turn, Turn, Turn];
    expect(stub.api.interactions.get(late.id)!.status).toBe("requires_action");

    // The late call is the pending one now; the next turn answers it as not used.
    expect(next.body.previous_interaction_id).toBe(late.id);
    expect(next.body.input[0].result).toMatchObject({ accepted: false });
    expect(JSON.stringify(next.body.input[0].result)).toContain("not used");

    const snap = await finished(matchId);
    const chats = snap.events.filter((e) => e.kind === "wolf_chat" && e.data.seat === wolf);
    expect(chats.map((e) => e.data.text)).not.toContain("too late");
    expect(snap.events.some((e) => e.kind === "turn_timed_out" && e.data.seat === wolf)).toBe(true);
  });
});
