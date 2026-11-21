import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { fakeCalls } from "../../src/harness/fake";
import type { MatchInit } from "../../src/core/match";
import { fakeAgent, finished } from "./helpers";

function initFor(matchId: string, failingSeat: number): MatchInit {
  const seats = Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, agentId: `rel-${i + 1}`, label: `rel-${i + 1}`, displayName: `R${i + 1}` }));
  const agents = Object.fromEntries(
    seats.map((s) => [s.seat, fakeAgent(`rel-${s.seat}`, s.seat === failingSeat ? { failProvision: 1 } : {})]),
  );
  return { matchId, rulesetId: "werewolf", seed: matchId, config: {}, seats, agents };
}

describe("a Match start that fails part-way", () => {
  it("releases every provisioned seat once, persists nothing, and a retry starts cleanly", async () => {
    const matchId = "start-release-1";
    const match = env.MATCH.getByName(matchId);
    // Seat 5's first provision fails (like Agent37's 409 instance_limit_reached).
    const err = await match.start(initFor(matchId, 5)).then(
      () => null,
      (e: unknown) => e,
    );
    expect(String(err)).toMatch(/fake provision failed/);
    expect(await match.snapshot()).toBeNull();
    for (const seat of [1, 2, 3, 4, 6, 7]) expect(fakeCalls(`${matchId}:${seat}`).close, `seat ${seat}`).toBe(1);

    // The League retries the same Match: every seat is provisioned again and the Match runs.
    await match.start(initFor(matchId, 5));
    for (const seat of [1, 2, 3, 4, 6, 7]) expect(fakeCalls(`${matchId}:${seat}`).provision, `seat ${seat}`).toBe(2);
    const snap = await finished(matchId);
    expect(snap.result).not.toBeNull();
  });
});
