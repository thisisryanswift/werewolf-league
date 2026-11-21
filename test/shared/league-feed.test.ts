import { describe, expect, it } from "vitest";
import { applyLeagueDiff, diffTile } from "../../src/shared/league-feed";
import type { LeagueSnapshot, MatchTile } from "../../src/shared/protocol";

const tile = (matchId: string, over: Partial<MatchTile> = {}): MatchTile => ({
  matchId,
  seed: `seed-${matchId}`,
  status: "running",
  seats: [
    { seat: 1, agentId: "a", label: "A" },
    { seat: 2, agentId: "b", label: "B" },
  ],
  summary: {
    phase: "Day",
    round: 1,
    step: "Speech Round A",
    alive: [1, 2],
    latestSpeech: null,
    thinking: 2,
    timeouts: 0,
  },
  startedAt: 100,
  ...over,
});

const snapshot = (tiles: MatchTile[]): LeagueSnapshot =>
  ({ tiles, stats: { started: tiles.length, settled: 0 } }) as unknown as LeagueSnapshot;

describe("League feed tile diffs", () => {
  it("a new tile is sent whole", () => {
    expect(diffTile(undefined, tile("m1"))).toEqual(tile("m1"));
  });

  it("an unchanged tile has no diff", () => {
    expect(diffTile(tile("m1"), tile("m1"))).toBeNull();
  });

  it("a changed tile sends only the changed summary fields", () => {
    const next = tile("m1");
    next.summary = { ...next.summary!, thinking: 0, latestSpeech: { seat: 2, text: "I suspect 1." } };
    expect(diffTile(tile("m1"), next)).toEqual({
      matchId: "m1",
      summary: { thinking: 0, latestSpeech: { seat: 2, text: "I suspect 1." } },
    });
  });

  it("a client folds diffs and removals into its snapshot, keeping tiles in start order", () => {
    const base = snapshot([tile("m1"), tile("m2", { startedAt: 200 })]);
    const next = applyLeagueDiff(base, {
      type: "tiles",
      rev: 2,
      tiles: [
        { matchId: "m2", summary: { phase: "Night", round: 2, step: "Wolf Chat" } },
        tile("m3", { startedAt: 50, status: "starting", summary: null }),
      ],
      removed: ["m1"],
    });
    expect(next.tiles.map((t) => t.matchId)).toEqual(["m3", "m2"]);
    expect(next.tiles[1]!.summary).toMatchObject({ phase: "Night", round: 2, step: "Wolf Chat", alive: [1, 2], thinking: 2 });
    // The input snapshot is not mutated.
    expect(base.tiles.map((t) => t.matchId)).toEqual(["m1", "m2"]);
  });

  it("replaces the League-wide fields when the diff carries them", () => {
    const base = snapshot([tile("m1")]);
    const next = applyLeagueDiff(base, {
      type: "tiles",
      rev: 3,
      tiles: [],
      removed: [],
      league: { stats: { started: 5, settled: 4 } } as never,
    });
    expect(next.stats).toEqual({ started: 5, settled: 4 });
    expect(next.tiles).toHaveLength(1);
  });
});
