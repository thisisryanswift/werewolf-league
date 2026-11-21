// The League grid's model (pure): which tiles show, in what order, which three
// are promoted to large tiles, and what each tile shows for a God View setting.
// Before the Narrator has scored any Match, the grid degrades: drama sorting
// falls back to Match number, the flagged filter is hidden, and promotion goes
// by most recent activity.
import { visibleDramaFlags, type Leaderboard, type LeagueTilesMessage, type MatchTile } from "../../src/shared/protocol";
import { spectatorLabel } from "../../src/shared/seat-label";

export type GridSort = "drama" | "alive" | "number";
export type GridFilter = "all" | "flagged" | "voting" | "night";

export interface GridOptions {
  sort: GridSort;
  filter: GridFilter;
  godView: boolean;
  /** When each Match last had activity (any increasing number), for promotion without Drama Scores. */
  activity?: Record<string, number>;
}

export interface GridArrangement {
  /** True once any tile has a Drama Score. */
  hasDrama: boolean;
  /** The sort in effect ("drama" becomes "number" without Drama Scores). */
  sort: GridSort;
  /** The filters on offer ("flagged" only once there are Drama Scores). */
  filters: GridFilter[];
  /** The filter in effect. */
  filter: GridFilter;
  /** Large tiles, in order. */
  promoted: MatchTile[];
  /** The other shown tiles, in the sort's order. */
  rest: MatchTile[];
}

const PROMOTED = 3;

/** The Drama Flags a Spectator may see on a tile (secret ones only in God View). */
export const tileFlags = (tile: MatchTile, godView: boolean) => visibleDramaFlags(tile.summary?.dramaFlags ?? [], godView);

const FILTERS: Record<GridFilter, (t: MatchTile, godView: boolean) => boolean> = {
  all: () => true,
  flagged: (t, godView) => tileFlags(t, godView).length > 0,
  // The public step: in God View it can name Night steps, but voting is public anyway.
  voting: (t) => t.summary?.step === "Vote",
  night: (t) => t.summary?.phase === "Night",
};

export function arrangeGrid(tiles: MatchTile[], options: GridOptions): GridArrangement {
  const hasDrama = tiles.some((t) => t.summary?.dramaScore !== undefined);
  const sort = options.sort === "drama" && !hasDrama ? "number" : options.sort;
  const filters: GridFilter[] = hasDrama ? ["all", "flagged", "voting", "night"] : ["all", "voting", "night"];
  const filter = filters.includes(options.filter) ? options.filter : "all";
  const shown = tiles.filter((t) => FILTERS[filter](t, options.godView));
  // Match number is start order: the feed keeps tiles in it.
  const number = new Map(tiles.map((t, i) => [t.matchId, i]));
  const byNumber = (a: MatchTile, b: MatchTile) => number.get(a.matchId)! - number.get(b.matchId)!;
  const drama = (t: MatchTile) => t.summary?.dramaScore ?? -1;
  const byDrama = (a: MatchTile, b: MatchTile) => drama(b) - drama(a) || byNumber(a, b);
  const alive = (t: MatchTile) => t.summary?.alive.length ?? t.seats.length;
  const byAlive = (a: MatchTile, b: MatchTile) => alive(a) - alive(b) || byDrama(a, b);
  const activity = (t: MatchTile) => options.activity?.[t.matchId] ?? -Infinity;
  const byActivity = (a: MatchTile, b: MatchTile) => activity(b) - activity(a) || byNumber(a, b);
  const sorted = [...shown].sort(sort === "drama" ? byDrama : sort === "alive" ? byAlive : byNumber);
  const promoted = [...shown].sort(hasDrama ? byDrama : byActivity).slice(0, PROMOTED);
  const big = new Set(promoted.map((t) => t.matchId));
  return { hasDrama, sort, filters, filter, promoted, rest: sorted.filter((t) => !big.has(t.matchId)) };
}

/**
 * Fold a feed message into the activity stamps used for promotion without Drama
 * Scores: a Match counts as active when it starts or its latest speech changes
 * (not on every thinking count, so the large tiles don't churn).
 */
export function noteActivity(activity: Record<string, number>, msg: LeagueTilesMessage): Record<string, number> {
  const next = { ...activity };
  for (const id of msg.removed) delete next[id];
  for (const d of msg.tiles) if ("seats" in d || d.summary?.latestSpeech) next[d.matchId] = msg.rev;
  return next;
}

/** The leaderboard strip: the top Agents by Overall Rating. */
export function topAgents(board: Leaderboard, count: number) {
  return board.rows.slice(0, count).map((r, i) => ({ agentId: r.agentId, rank: i + 1, name: r.name, rating: Math.round(r.overall).toString() }));
}

// ---- one tile ---------------------------------------------------------------

export interface TilePip {
  seat: number;
  alive: boolean;
  /** The seat's role in God View, else null. */
  role: string | null;
}

export interface TileView {
  /** "Day 2", "Night 1", "Over" or "Starting". */
  phase: string;
  night: boolean;
  /** The step tag (God View may name the Night step), or null. */
  step: string | null;
  voting: boolean;
  pips: TilePip[];
  alive: number;
  total: number;
  /** Drama Score as a percentage, or null before the first narration. */
  drama: number | null;
  /** Display names of the Drama Flags this Spectator may see. */
  flags: string[];
  /** Players thinking; null at Night without God View, since it would hint at roles. */
  thinking: number | null;
  timeouts: number;
  speech: { seat: number; speaker: string; text: string } | null;
}

/** "claim_war" -> "Claim war". */
export const flagName = (id: string) => {
  const words = id.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function tileView(tile: MatchTile, godView: boolean): TileView {
  const s = tile.summary;
  const alive = new Set(s?.alive ?? tile.seats.map((x) => x.seat));
  const night = s?.phase === "Night";
  const said = s?.latestSpeech ?? null;
  const speaker = said && tile.seats.find((x) => x.seat === said.seat);
  return {
    phase: s === null ? "Starting" : s.round === null || s.phase === "Over" ? s.phase : `${s.phase} ${s.round}`,
    night,
    step: (godView ? s?.godView?.step : undefined) ?? s?.step ?? null,
    voting: s?.step === "Vote",
    pips: tile.seats.map((x) => ({ seat: x.seat, alive: alive.has(x.seat), role: godView ? (s?.godView?.roles[x.seat] ?? null) : null })),
    alive: alive.size,
    total: tile.seats.length,
    drama: s?.dramaScore === undefined ? null : Math.round(s.dramaScore * 100),
    flags: tileFlags(tile, godView).map((f) => flagName(f.id)),
    thinking: s === null || (night && !godView) ? null : s.thinking,
    timeouts: s?.timeouts ?? 0,
    speech: said ? { ...said, speaker: speaker ? spectatorLabel(speaker) : `Seat ${said.seat}` } : null,
  };
}
