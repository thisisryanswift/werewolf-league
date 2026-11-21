// League feed diffs, shared by the League DO (which computes them) and grid
// clients (which fold them into the snapshot they got on join).

import type { LeagueSnapshot, LeagueTilesMessage, MatchTile, TileDiff, TileSummary } from "./protocol";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The changes from `prev` to `next`, or null if none. A new tile (no `prev`) is sent whole. */
export function diffTile(prev: MatchTile | undefined, next: MatchTile): TileDiff | null {
  if (!prev) return next;
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof MatchTile)[]) {
    if (key === "matchId" || key === "summary" || same(prev[key], next[key])) continue;
    diff[key] = next[key];
  }
  if (!prev.summary || !next.summary) {
    if (!same(prev.summary, next.summary)) diff.summary = next.summary;
  } else {
    const s: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(prev.summary), ...Object.keys(next.summary)]) as Set<keyof TileSummary>;
    for (const key of keys) if (!same(prev.summary[key], next.summary[key])) s[key] = next.summary[key];
    if (Object.keys(s).length) diff.summary = s;
  }
  return Object.keys(diff).length ? { matchId: next.matchId, ...diff } : null;
}

function applyTile(prev: MatchTile | undefined, diff: TileDiff): MatchTile {
  if (!prev) return diff as MatchTile;
  const { summary, ...rest } = diff;
  const next = { ...prev, ...rest } as MatchTile;
  if (summary === null) next.summary = null;
  else if (summary) next.summary = { ...(prev.summary ?? {}), ...summary } as TileSummary;
  return next;
}

/** Fold a "tiles" feed message into a snapshot. Returns a new snapshot; tiles stay in start order. */
export function applyLeagueDiff(snapshot: LeagueSnapshot, msg: LeagueTilesMessage): LeagueSnapshot {
  const tiles = new Map(snapshot.tiles.map((t) => [t.matchId, t]));
  for (const id of msg.removed) tiles.delete(id);
  for (const d of msg.tiles) tiles.set(d.matchId, applyTile(tiles.get(d.matchId), d));
  return {
    ...snapshot,
    ...msg.league,
    tiles: [...tiles.values()].sort((a, b) => a.startedAt - b.startedAt),
  };
}
