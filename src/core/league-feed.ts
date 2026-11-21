// Coalesced League feed. Changes only mark the feed dirty; at most one "tiles"
// message goes out per feed interval (a leading message, then a trailing one
// for anything that changed meanwhile). Each message diffs the current snapshot
// against the last one sent, so it carries only what changed, however many
// events caused it.
//
// The baseline lives in memory. After an eviction it is empty, so the next
// message carries every tile whole, which clients fold in like any diff.

import { diffTile } from "../shared/league-feed";
import type { LeagueSnapshot, LeagueTilesMessage, MatchTile, TileDiff } from "../shared/protocol";

export interface FeedDeps {
  /** Minimum time between messages. */
  intervalMs(): number;
  now(): number;
  setTimer(fn: () => void, ms: number): void;
  /** The current League snapshot. */
  snapshot(): LeagueSnapshot;
  send(msg: LeagueTilesMessage): void;
  /** The next message revision (persisted by the caller, so it survives hibernation). */
  nextRev(): number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class FeedCoalescer {
  private sent: LeagueSnapshot | null = null;
  private lastFlush = -Infinity;
  private timer = false;

  constructor(private readonly deps: FeedDeps) {}

  /** Record what clients already have (no message is sent). */
  baseline(snapshot: LeagueSnapshot): void {
    this.sent = structuredClone(snapshot);
  }

  /** Something in the snapshot changed: send it within the feed interval. */
  changed(): void {
    if (this.timer) return;
    const wait = this.lastFlush + this.deps.intervalMs() - this.deps.now();
    if (wait <= 0) return this.flush();
    this.timer = true;
    this.deps.setTimer(() => {
      this.timer = false;
      this.flush();
    }, wait);
  }

  /**
   * Send pending changes now, outside the interval. Call before sending a joining
   * client the snapshot, so the baseline later diffs use equals what it received.
   */
  flushNow(): void {
    this.flush();
  }

  private flush(): void {
    this.lastFlush = this.deps.now();
    const current = this.deps.snapshot();
    const msg = this.diff(this.sent, current);
    this.sent = structuredClone(current);
    if (msg) this.deps.send({ type: "tiles", rev: this.deps.nextRev(), ...msg });
  }

  private diff(prev: LeagueSnapshot | null, next: LeagueSnapshot): Omit<LeagueTilesMessage, "type" | "rev"> | null {
    const before = new Map<string, MatchTile>((prev?.tiles ?? []).map((t) => [t.matchId, t]));
    const tiles: TileDiff[] = [];
    for (const t of next.tiles) {
      const d = diffTile(before.get(t.matchId), t);
      if (d) tiles.push(d);
    }
    const ids = new Set(next.tiles.map((t) => t.matchId));
    const removed = [...before.keys()].filter((id) => !ids.has(id));
    const league: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next)) {
      if (key === "tiles") continue;
      if (!prev || !same(prev[key as keyof LeagueSnapshot], value)) league[key] = value;
    }
    const changed = Object.keys(league).length > 0;
    if (!tiles.length && !removed.length && !changed) return null;
    return { tiles, removed, ...(changed ? { league: league as LeagueTilesMessage["league"] } : {}) };
  }
}
