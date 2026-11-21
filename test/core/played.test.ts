// Matches played per Side, backfilled from stored settlements for records that predate the count.
import { describe, expect, it } from "vitest";
import { backfillPlayed, needsPlayedBackfill, type AgentRecord, type PlayedSource } from "../../src/core/ratings";

const record = (extra: Partial<AgentRecord> = {}): AgentRecord => ({ name: "x", ratings: {}, matches: 0, wins: {}, timeouts: 0, ...extra });

const rated = (players: [string, string][]): PlayedSource => ({
  ratings: { players: players.map(([agentId, side]) => ({ agentId, side })) },
  seats: [],
  result: { sides: {} },
});

describe("backfillPlayed", () => {
  it("counts each rated Match once per Side an Agent sat on, skipping unrated settlements", () => {
    const settlements: PlayedSource[] = [
      rated([["a", "wolf"], ["a", "village"], ["a", "village"], ["b", "village"]]),
      rated([["a", "village"], ["b", "wolf"]]),
      { ratings: null, seats: null, result: { sides: { 1: "wolf" } } },
      // An older rated shape without `players`: seats and the result's Sides say who sat where.
      { ratings: {}, seats: [{ seat: 1, agentId: "b" }, { seat: 2, agentId: "b" }], result: { sides: { 1: "wolf", 2: "wolf" } } },
    ];
    const out = backfillPlayed({ a: record(), b: record(), c: record() }, settlements);
    expect(out.a!.played).toEqual({ wolf: 1, village: 2 });
    expect(out.b!.played).toEqual({ wolf: 2, village: 1 });
    expect(out.c!.played).toEqual({});
    expect(needsPlayedBackfill(out)).toBe(false);
  });

  it("leaves records that already have counts alone", () => {
    const records = { a: record({ played: { wolf: 5 } }), b: record() };
    const out = backfillPlayed(records, [rated([["a", "wolf"], ["b", "wolf"]])]);
    expect(out.a!.played).toEqual({ wolf: 5 });
    expect(out.b!.played).toEqual({ wolf: 1 });
    expect(backfillPlayed(out, [rated([["b", "wolf"]])])).toBe(out);
  });
});
