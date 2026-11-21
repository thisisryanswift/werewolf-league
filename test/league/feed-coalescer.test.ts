import { describe, expect, it } from "vitest";
import { FeedCoalescer } from "../../src/core/league-feed";
import type { LeagueSnapshot, LeagueTilesMessage, MatchTile } from "../../src/shared/protocol";

const tile = (matchId: string, speech: string | null = null): MatchTile => ({
  matchId,
  seed: "s",
  status: "running",
  seats: [{ seat: 1, agentId: "a", label: "A" }],
  summary: {
    phase: "Day",
    round: 1,
    step: "Vote",
    alive: [1],
    latestSpeech: speech ? { seat: 1, text: speech } : null,
    thinking: 1,
    timeouts: 0,
  },
  startedAt: 1,
});

/** A coalescer over a mutable League state, with a manual clock and timer queue. */
function rig(intervalMs = 500) {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const state = { tiles: [] as MatchTile[], stats: { started: 0, settled: 0 } };
  const sent: LeagueTilesMessage[] = [];
  let rev = 0;
  const feed = new FeedCoalescer({
    intervalMs: () => intervalMs,
    now: () => now,
    setTimer: (fn, ms) => timers.push({ at: now + ms, fn }),
    snapshot: () => state as unknown as LeagueSnapshot,
    send: (m) => sent.push(m),
    nextRev: () => ++rev,
  });
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((t) => t.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };
  return { feed, state, sent, advance };
}

describe("League feed coalescer", () => {
  it("turns a burst of changes into at most one message per interval", () => {
    const { feed, state, sent, advance } = rig(500);
    feed.baseline(state as unknown as LeagueSnapshot);
    state.tiles = [tile("m1")];
    for (let i = 0; i < 100; i++) {
      state.tiles = [tile("m1", `line ${i}`)];
      feed.changed();
      advance(10); // 100 events over 1 s
    }
    advance(1000);
    // Leading message, then one per 500 ms window.
    expect(sent.length).toBeLessThanOrEqual(3);
    expect(sent.length).toBeGreaterThanOrEqual(2);
    // The last message carries the final line as a small diff.
    expect(sent.at(-1)!.tiles).toEqual([{ matchId: "m1", summary: { latestSpeech: { seat: 1, text: "line 99" } } }]);
    expect(sent.map((m) => m.rev)).toEqual(sent.map((_, i) => i + 1));
  });

  it("sends removed tiles and changed League-wide fields, and nothing when nothing changed", () => {
    const { feed, state, sent, advance } = rig(500);
    state.tiles = [tile("m1"), tile("m2")];
    feed.baseline(state as unknown as LeagueSnapshot);
    state.tiles = [tile("m2")];
    state.stats = { started: 2, settled: 1 };
    feed.changed();
    expect(sent).toEqual([{ type: "tiles", rev: 1, tiles: [], removed: ["m1"], league: { stats: { started: 2, settled: 1 } } }]);
    advance(600);
    feed.changed();
    advance(600);
    expect(sent).toHaveLength(1);
  });

  it("sends every tile whole when it has no baseline (e.g. after an eviction)", () => {
    const { feed, state, sent } = rig(500);
    state.tiles = [tile("m1")];
    feed.changed();
    expect(sent[0]!.tiles).toEqual([tile("m1")]);
  });
});
