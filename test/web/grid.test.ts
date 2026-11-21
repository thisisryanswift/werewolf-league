// The League grid's model: which tiles show, in what order, which are promoted,
// and what each tile shows for a God View setting.
import { describe, expect, it } from "vitest";
import type { MatchTile, TileDramaFlag, TileSummary } from "../../src/shared/protocol";
import { arrangeGrid, noteActivity, tileView, topAgents, type GridOptions } from "../../web/grid/model";
import { matchHash, matchIdFromHash } from "../../web/grid/route";

describe("Match links", () => {
  it("round-trips a Match id through the URL hash", () => {
    expect(matchHash("abc-123")).toBe("#match=abc-123");
    expect(matchIdFromHash(matchHash("abc-123"))).toBe("abc-123");
  });
  it("ignores hashes that are not Match links", () => {
    expect(matchIdFromHash("")).toBeNull();
    expect(matchIdFromHash("#")).toBeNull();
    expect(matchIdFromHash("#match=")).toBeNull();
    expect(matchIdFromHash("#other=x")).toBeNull();
    expect(matchIdFromHash("#match=a/b")).toBeNull();
  });
});

describe("recent activity", () => {
  it("stamps a Match when it starts or its latest speech changes, with the feed message's rev", () => {
    let a = noteActivity({}, { type: "tiles", rev: 4, removed: [], tiles: [{ matchId: "new", seed: "s", status: "starting", seats: [], summary: null, startedAt: 1 }] });
    expect(a).toEqual({ new: 4 });
    a = noteActivity(a, {
      type: "tiles",
      rev: 5,
      removed: [],
      tiles: [
        { matchId: "talk", summary: { latestSpeech: { seat: 1, text: "hi" } } },
        { matchId: "think", summary: { thinking: 2 } },
      ],
    });
    expect(a).toEqual({ new: 4, talk: 5 });
    expect(noteActivity(a, { type: "tiles", rev: 6, removed: ["new"], tiles: [] })).toEqual({ talk: 5 });
  });
});

describe("leaderboard strip", () => {
  it("lists the top Agents by Overall Rating, rounded", () => {
    const row = (agentId: string, overall: number) => ({ agentId, name: agentId.toUpperCase(), ratings: {}, overall, matches: 1, wins: {}, timeouts: 0, calibration: null });
    const board = { sides: ["wolf", "village"], rows: [row("a", 1250.6), row("b", 1210.2), row("c", 1200), row("d", 1190)] };
    expect(topAgents(board, 3)).toEqual([
      { agentId: "a", rank: 1, name: "A", rating: "1251" },
      { agentId: "b", rank: 2, name: "B", rating: "1210" },
      { agentId: "c", rank: 3, name: "C", rating: "1200" },
    ]);
  });
});

let started = 0;
/** A running 7-seat tile; `summary` fields override a Day 1 speech-round default. */
function tile(matchId: string, summary: Partial<TileSummary> | null = {}): MatchTile {
  started += 1;
  return {
    matchId,
    seed: `seed-${matchId}`,
    status: "running",
    seats: [1, 2, 3, 4, 5, 6, 7].map((seat) => ({ seat, agentId: `a${seat}`, label: `Agent${seat} #1`, displayName: `Name${seat}` })),
    startedAt: started,
    summary:
      summary === null
        ? null
        : {
            phase: "Day",
            round: 1,
            alive: [1, 2, 3, 4, 5, 6, 7],
            latestSpeech: null,
            step: "Speech Round A",
            godView: { roles: { 1: "werewolf", 2: "werewolf", 3: "seer", 4: "doctor", 5: "villager", 6: "villager", 7: "villager" }, step: "Speech Round A" },
            thinking: 0,
            timeouts: 0,
            ...summary,
          },
  };
}

const opts = (o: Partial<GridOptions> = {}): GridOptions => ({ sort: "drama", filter: "all", godView: true, ...o });
const ids = (tiles: MatchTile[]) => tiles.map((t) => t.matchId);
/** All tiles in display order: promoted first, then the rest. */
const order = (tiles: MatchTile[], o: Partial<GridOptions> = {}) => {
  const g = arrangeGrid(tiles, opts(o));
  return [...ids(g.promoted), ...ids(g.rest)];
};

describe("sorting", () => {
  it("sorts by Drama Score, highest first, with unscored Matches last in Match number order", () => {
    const tiles = [tile("m1", { dramaScore: 0.2 }), tile("m2"), tile("m3", { dramaScore: 0.9 }), tile("m4", { dramaScore: 0.5 }), tile("m5", { dramaScore: 0.5 }), tile("m6")];
    expect(order(tiles)).toEqual(["m3", "m4", "m5", "m1", "m2", "m6"]);
  });

  it("falls back to Match number when no Match has a Drama Score", () => {
    const tiles = [tile("m1"), tile("m2"), tile("m3"), tile("m4"), tile("m5")];
    const g = arrangeGrid(tiles, opts({ sort: "drama" }));
    expect(g.hasDrama).toBe(false);
    expect(g.sort).toBe("number");
    expect(ids(g.rest)).toEqual(["m4", "m5"]);
  });
});

describe("promoted tiles", () => {
  it("promotes the top 3 by Drama Score whatever the sort, and the rest follow the sort", () => {
    const tiles = [
      tile("m1", { dramaScore: 0.1, alive: [1, 2, 3, 4, 5] }),
      tile("m2", { dramaScore: 0.8 }),
      tile("m3", { dramaScore: 0.7, alive: [1, 2, 3, 4] }),
      tile("m4", { dramaScore: 0.9 }),
      tile("m5", { dramaScore: 0.3, alive: [1, 2, 3] }),
      tile("m6", { dramaScore: 0.6 }),
    ];
    const g = arrangeGrid(tiles, opts({ sort: "alive" }));
    expect(ids(g.promoted)).toEqual(["m4", "m2", "m3"]);
    // Fewest alive first; ties by Drama Score.
    expect(ids(g.rest)).toEqual(["m5", "m1", "m6"]);
  });

  it("without Drama Scores, promotes the Matches with the most recent activity", () => {
    const tiles = [tile("m1"), tile("m2"), tile("m3"), tile("m4"), tile("m5")];
    const g = arrangeGrid(tiles, opts({ activity: { m2: 10, m5: 30, m4: 20 } }));
    expect(ids(g.promoted)).toEqual(["m5", "m4", "m2"]);
    expect(ids(g.rest)).toEqual(["m1", "m3"]);
  });

  it("without Drama Scores, holds each promoted Match for a while so the large tiles stay readable", () => {
    const tiles = [tile("m1"), tile("m2"), tile("m3"), tile("m4"), tile("m5")];
    const first = arrangeGrid(tiles, opts({ activity: { m1: 3, m2: 2, m3: 1 }, now: 0 }));
    expect(ids(first.promoted)).toEqual(["m1", "m2", "m3"]);
    // m4 and m5 become more active, but the held Matches stay until their hold ends.
    const held = arrangeGrid(tiles, opts({ activity: { m1: 3, m2: 2, m3: 1, m4: 9, m5: 8 }, now: 5_000, held: first.held }));
    expect(ids(held.promoted)).toEqual(["m1", "m2", "m3"]);
    expect(ids(held.rest)).toEqual(["m4", "m5"]);
    // After the hold, the most active Matches take over; m1 was re-promoted at once if still top-ranked.
    const later = arrangeGrid(tiles, opts({ activity: { m1: 3, m2: 2, m3: 1, m4: 9, m5: 8 }, now: 20_000, held: held.held }));
    expect(ids(later.promoted)).toEqual(["m4", "m5", "m1"]);
    // A held Match that leaves the filter frees its slot.
    const filtered = arrangeGrid(tiles.map((t) => (t.matchId === "m4" ? { ...t, summary: { ...t.summary!, step: "Vote" } } : t)), opts({ filter: "voting", now: 21_000, held: later.held }));
    expect(ids(filtered.promoted)).toEqual(["m4"]);
  });
});

const pub = (id: string): TileDramaFlag => ({ id, visibility: "public-safe" });
const secret = (id: string): TileDramaFlag => ({ id, visibility: "secret" });

describe("filters", () => {
  const tiles = () => [
    tile("vote", { step: "Vote", godView: { roles: {}, step: "Vote" }, dramaScore: 0.2, dramaFlags: [] }),
    tile("night", { phase: "Night", round: 2, step: "Night actions", godView: { roles: {}, step: "Wolf Chat" }, dramaScore: 0.3, dramaFlags: [] }),
    tile("public", { dramaScore: 0.4, dramaFlags: [pub("claim_war")] }),
    tile("secret", { dramaScore: 0.5, dramaFlags: [secret("wolf_fooling_table")] }),
    tile("starting", null),
  ];
  const shown = (o: Partial<GridOptions>) => order(tiles(), o).sort();

  it("shows voting Matches or Night Matches", () => {
    expect(shown({ filter: "voting" })).toEqual(["vote"]);
    expect(shown({ filter: "night" })).toEqual(["night"]);
    expect(shown({ filter: "all" })).toHaveLength(5);
  });

  it("counts secret Drama Flags as flagged only in God View", () => {
    expect(shown({ filter: "flagged", godView: true })).toEqual(["public", "secret"]);
    expect(shown({ filter: "flagged", godView: false })).toEqual(["public"]);
  });

  it("offers the flagged filter only once a Match has a Drama Score, and ignores it before", () => {
    expect(arrangeGrid(tiles(), opts()).filters).toEqual(["all", "flagged", "voting", "night"]);
    const unscored = [tile("a", { step: "Vote" }), tile("b")];
    const g = arrangeGrid(unscored, opts({ filter: "flagged" }));
    expect(g.filters).toEqual(["all", "voting", "night"]);
    expect(g.filter).toBe("all");
    expect([...ids(g.promoted), ...ids(g.rest)]).toEqual(["a", "b"]);
  });
});

describe("a tile", () => {
  const night = () =>
    tile("n", {
      phase: "Night",
      round: 2,
      alive: [1, 3, 4, 6, 7],
      step: "Night actions",
      godView: { roles: { 1: "werewolf", 2: "werewolf", 3: "seer", 4: "doctor", 5: "villager", 6: "villager", 7: "villager" }, step: "Wolf Chat" },
      thinking: 2,
      timeouts: 1,
      dramaScore: 0.42,
      dramaFlags: [pub("table_split"), secret("wolves_split")],
    });

  it("in God View shows roles, the God View step, the Night thinking count and secret flags", () => {
    const v = tileView(night(), true);
    expect(v.phase).toBe("Night 2");
    expect(v.step).toBe("Wolf Chat");
    expect(v.thinking).toBe(2);
    expect(v.timeouts).toBe(1);
    expect(v.alive).toBe(5);
    expect(v.drama).toBe(42);
    expect(v.flags).toEqual(["Table split", "Wolves split"]);
    expect(v.pips.slice(0, 3)).toEqual([
      { seat: 1, alive: true, role: "werewolf" },
      { seat: 2, alive: false, role: "werewolf" },
      { seat: 3, alive: true, role: "seer" },
    ]);
  });

  it("with God View off hides roles, the Night step, the Night thinking count and secret flags", () => {
    const v = tileView(night(), false);
    expect(v.step).toBe("Night actions");
    expect(v.thinking).toBeNull();
    expect(v.flags).toEqual(["Table split"]);
    expect(v.pips.slice(0, 2)).toEqual([
      { seat: 1, alive: true, role: null },
      { seat: 2, alive: false, role: null },
    ]);
    expect(JSON.stringify(v)).not.toMatch(/werewolf|seer|wolves_split|Wolf Chat/i);
  });

  it("shows the Day thinking count without God View, and the latest speech with its speaker", () => {
    const v = tileView(tile("d", { thinking: 3, latestSpeech: { seat: 4, text: "P2 is lying." } }), false);
    expect(v.thinking).toBe(3);
    expect(v.speech).toEqual({ seat: 4, speaker: "Name4 · Agent4 #1", text: "P2 is lying." });
    expect(v.drama).toBeNull();
  });

  it("shows a starting Match before its first summary", () => {
    const v = tileView(tile("s", null), true);
    expect(v.phase).toBe("Starting");
    expect(v.alive).toBe(7);
    expect(v.pips).toHaveLength(7);
    expect(v.speech).toBeNull();
  });
});
