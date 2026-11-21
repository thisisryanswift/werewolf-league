import { describe, expect, it } from "vitest";
import { ratingsHistory, type RatedSettlement } from "../../src/core/ratings-history";

const ch = (agentId: string, side: string, before: number, delta: number) => ({ agentId, side, before, delta, after: before + delta });

describe("ratingsHistory", () => {
  const sides = ["wolf", "village"];
  const names = { a: "Alpha", b: "Bravo", c: "Charlie" };

  it("carries every Agent's Overall Rating forward through scripted settlements, in settlement order", () => {
    const settlements: RatedSettlement[] = [
      // Out of order on input: settledAt decides.
      { matchNumber: 2, settledAt: 2000, ratings: { players: [], agents: [ch("a", "village", 1200, -10), ch("c", "wolf", 1200, 10)] } },
      { matchNumber: 1, settledAt: 1000, ratings: { players: [], agents: [ch("a", "wolf", 1200, 16), ch("b", "village", 1200, -16)] } },
      { matchNumber: 3, settledAt: 3000, ratings: { players: [], agents: [ch("b", "wolf", 1200, 8), ch("c", "village", 1200, -8)] } },
    ];
    const h = ratingsHistory({ settlements, sides, names });
    expect(h.agents).toEqual([
      { agentId: "a", name: "Alpha" },
      { agentId: "b", name: "Bravo" },
      { agentId: "c", name: "Charlie" },
    ]);
    expect(h.points).toEqual([
      {
        matchNumber: 1,
        settledAt: 1000,
        overall: { a: 1208, b: 1192, c: 1200 },
        sides: { wolf: { a: 1216, b: 1200, c: 1200 }, village: { a: 1200, b: 1184, c: 1200 } },
      },
      // a: wolf 1216, village 1190 -> 1203; c: wolf 1210 -> 1205
      {
        matchNumber: 2,
        settledAt: 2000,
        overall: { a: 1203, b: 1192, c: 1205 },
        sides: { wolf: { a: 1216, b: 1200, c: 1210 }, village: { a: 1190, b: 1184, c: 1200 } },
      },
      // b: wolf 1208, village 1184 -> 1196; c: wolf 1210, village 1192 -> 1201
      {
        matchNumber: 3,
        settledAt: 3000,
        overall: { a: 1203, b: 1196, c: 1201 },
        sides: { wolf: { a: 1216, b: 1208, c: 1210 }, village: { a: 1190, b: 1184, c: 1192 } },
      },
    ]);
  });

  it("keeps only the most recent settlements up to the cap, starting from their before ratings", () => {
    const settlements: RatedSettlement[] = [
      { matchNumber: 1, settledAt: 1, ratings: { players: [], agents: [ch("a", "wolf", 1200, 20)] } },
      { matchNumber: 2, settledAt: 2, ratings: { players: [], agents: [ch("a", "wolf", 1220, 10)] } },
    ];
    const h = ratingsHistory({ settlements, sides, names, cap: 1 });
    expect(h.agents).toEqual([{ agentId: "a", name: "Alpha" }]);
    // Wolf starts at its first before in the window (1220); Village, never played, reads 1200.
    expect(h.points).toEqual([{ matchNumber: 2, settledAt: 2, overall: { a: 1215 }, sides: { wolf: { a: 1230 }, village: { a: 1200 } } }]);
  });

  it("skips unrated settlements and is empty with none rated", () => {
    expect(ratingsHistory({ settlements: [{ settledAt: 1, ratings: null }], sides, names })).toEqual({ agents: [], points: [] });
  });
});
