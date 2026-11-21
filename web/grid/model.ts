// The League grid's model (pure): which tiles show, in what order, which three
// are promoted to large tiles, and what each tile shows for a Narrator's View setting.
// Before the Narrator has scored any Match, the grid degrades: drama sorting
// falls back to Match number, the flagged filter is hidden, and promotion goes
// by most recent activity, holding each promoted Match for a while so the
// large tiles don't swap faster than a line can be read.
import { visibleDramaFlags, type Leaderboard, type LeagueTilesMessage, type MatchTile } from "../../src/shared/protocol";
import { matchLabel } from "../../src/shared/match-label";
import { spectatorLabel } from "../../src/shared/seat-label";
import { formatUsd } from "../cost";

export type GridSort = "drama" | "alive" | "number";
export type GridFilter = "all" | "flagged" | "voting" | "night";

export interface GridOptions {
  sort: GridSort;
  filter: GridFilter;
  narratorView: boolean;
  /** When each Match last had activity (any increasing number), for promotion without Drama Scores. */
  activity?: Record<string, number>;
  /** Clock time (ms) for holding promoted Matches without Drama Scores; omit for no hold. */
  now?: number;
  /** The previous arrangement's `held`. */
  held?: PromotionHold[];
}

/** A Match promoted (without Drama Scores) at `since`. */
export interface PromotionHold {
  matchId: string;
  since: number;
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
  /** Promotion holds to pass back in next time (empty with Drama Scores). */
  held: PromotionHold[];
}

const PROMOTED = 3;
/** How long a Match stays promoted by activity before a more active one may replace it. */
export const PROMOTION_HOLD_MS = 10_000;

/** The Drama Flags a Spectator may see on a tile (secret ones only in Narrator's View). */
export const tileFlags = (tile: MatchTile, narratorView: boolean) => visibleDramaFlags(tile.summary?.dramaFlags ?? [], narratorView);

const FILTERS: Record<GridFilter, (t: MatchTile, narratorView: boolean) => boolean> = {
  all: () => true,
  flagged: (t, narratorView) => tileFlags(t, narratorView).length > 0,
  // The public step: in Narrator's View it can name Night steps, but voting is public anyway.
  voting: (t) => t.summary?.step === "Vote",
  night: (t) => t.summary?.phase === "Night",
};

export function arrangeGrid(tiles: MatchTile[], options: GridOptions): GridArrangement {
  const hasDrama = tiles.some((t) => t.summary?.dramaScore !== undefined);
  const sort = options.sort === "drama" && !hasDrama ? "number" : options.sort;
  const filters: GridFilter[] = hasDrama ? ["all", "flagged", "voting", "night"] : ["all", "voting", "night"];
  const filter = filters.includes(options.filter) ? options.filter : "all";
  const shown = tiles.filter((t) => FILTERS[filter](t, options.narratorView));
  // By Match Number; older Matches without one come first, in start order (the feed keeps tiles in it).
  const index = new Map(tiles.map((t, i) => [t.matchId, i]));
  const byNumber = (a: MatchTile, b: MatchTile) => (a.matchNumber ?? 0) - (b.matchNumber ?? 0) || index.get(a.matchId)! - index.get(b.matchId)!;
  const drama = (t: MatchTile) => t.summary?.dramaScore ?? -1;
  const byDrama = (a: MatchTile, b: MatchTile) => drama(b) - drama(a) || byNumber(a, b);
  const alive = (t: MatchTile) => t.summary?.alive.length ?? t.seats.length;
  const byAlive = (a: MatchTile, b: MatchTile) => alive(a) - alive(b) || byDrama(a, b);
  const activity = (t: MatchTile) => options.activity?.[t.matchId] ?? -Infinity;
  const byActivity = (a: MatchTile, b: MatchTile) => activity(b) - activity(a) || byNumber(a, b);
  const sorted = [...shown].sort(sort === "drama" ? byDrama : sort === "alive" ? byAlive : byNumber);
  let promoted: MatchTile[];
  let held: PromotionHold[] = [];
  if (hasDrama) promoted = [...shown].sort(byDrama).slice(0, PROMOTED);
  else {
    const ranked = [...shown].sort(byActivity);
    if (options.now === undefined) promoted = ranked.slice(0, PROMOTED);
    else {
      const now = options.now;
      const byId = new Map(shown.map((t) => [t.matchId, t]));
      held = (options.held ?? []).filter((h) => byId.has(h.matchId) && now - h.since < PROMOTION_HOLD_MS).slice(0, PROMOTED);
      for (const t of ranked) {
        if (held.length >= PROMOTED) break;
        if (!held.some((h) => h.matchId === t.matchId)) held.push({ matchId: t.matchId, since: now });
      }
      promoted = held.map((h) => byId.get(h.matchId)!);
    }
  }
  const big = new Set(promoted.map((t) => t.matchId));
  return { hasDrama, sort, filters, filter, promoted, rest: sorted.filter((t) => !big.has(t.matchId)), held };
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
  /** The seat's role in Narrator's View, else null. */
  role: string | null;
  /** The pip's letter: "×" when dead, the role's initial in Narrator's View, else "". */
  mark: string;
  /** The latest speaker (until the Match is over). */
  speaking: boolean;
}

/** The tile's top line: "MATCH N · D3 · step". */
export interface TileKicker {
  match: string;
  /** "D3", "N1", "END", or null before the first summary. */
  chip: string | null;
  step: string | null;
  /** The step as small tiles show it ("Speech A", "Reply", "Night"). */
  stepShort: string | null;
}

/** A Drama Flag as the tile names it; secret ones only appear in Narrator's View. */
export interface TileFlag {
  name: string;
  secret: boolean;
}

/** "Night" (navy), "hot" (yellow: Drama Score >= 0.70, not Over), "starting", else "plain". */
export type TileFill = "night" | "hot" | "starting" | "plain";

/** Drama Score at or above which a live tile turns yellow. */
export const HOT_DRAMA = 0.7;

const SHORT_STEP: Record<string, string> = { "Night actions": "Night", "Right of Reply": "Reply" };
/** "Speech Round A" -> "Speech A"; other steps by SHORT_STEP, else unchanged. */
const shortStep = (step: string) => SHORT_STEP[step] ?? step.replace(/^Speech Round /, "Speech ");
/** "Werewolves" -> "Werewolves win", "Village" -> "Village wins". */
const resultLine = (side: string) => `${side} ${/s$/i.test(side) ? "win" : "wins"}`;

export interface TileView {
  /** "Day 2", "Night 1", "Over" or "Starting". */
  phase: string;
  night: boolean;
  /** The step tag (Narrator's View may name the Night step), or null. */
  step: string | null;
  voting: boolean;
  pips: TilePip[];
  alive: number;
  total: number;
  /** Drama Score as a percentage, or null before the first narration. */
  drama: number | null;
  /** Display names of the Drama Flags this Spectator may see. */
  flags: string[];
  /** Players thinking; null at Night without Narrator's View, since it would hint at roles. */
  thinking: number | null;
  timeouts: number;
  /** `speaker` is the Spectator label; `name` the Display Name alone (what tiles cite). */
  speech: { seat: number; speaker: string; name: string; text: string } | null;
  /** The Match's model cost so far, e.g. "$0.43", or null when the summary has none. */
  cost: string | null;
  over: boolean;
  kicker: TileKicker;
  /** The result when Over, else the top visible Drama Flag, else "Night falls" / "The table votes" / the step. */
  headline: string;
  /** One more visible flag than the headline shows, plus how many more there are; null if none. */
  also: { flag: TileFlag; more: number } | null;
  fill: TileFill;
  /** "42%", or "—" before the first narration. */
  dramaText: string;
}

/** "claim_war" -> "Claim war". */
export const flagName = (id: string) => {
  const words = id.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export function tileView(tile: MatchTile, narratorView: boolean): TileView {
  const s = tile.summary;
  const alive = new Set(s?.alive ?? tile.seats.map((x) => x.seat));
  const night = s?.phase === "Night";
  const said = s?.latestSpeech ?? null;
  const speaker = said && tile.seats.find((x) => x.seat === said.seat);
  const over = s?.phase === "Over";
  const step = (narratorView ? s?.narratorView?.step : undefined) ?? s?.step ?? null;
  const drama = s?.dramaScore === undefined ? null : Math.round(s.dramaScore * 100);
  const flags = tileFlags(tile, narratorView).map((f) => ({ name: flagName(f.id), secret: f.visibility === "secret" }));
  // The result (or "Over") headlines a finished Match, so its flags all move to the Also line.
  const headlineFlag = over ? undefined : flags[0];
  const others = headlineFlag ? flags.slice(1) : flags;
  const speakingSeat = over ? null : (said?.seat ?? null);
  return {
    phase: s === null ? "Starting" : s.round === null || s.phase === "Over" ? s.phase : `${s.phase} ${s.round}`,
    night,
    step,
    voting: s?.step === "Vote",
    pips: tile.seats.map((x) => {
      const role = narratorView ? (s?.narratorView?.roles[x.seat] ?? null) : null;
      const living = alive.has(x.seat);
      return { seat: x.seat, alive: living, role, mark: !living ? "×" : role ? role.charAt(0).toUpperCase() : "", speaking: x.seat === speakingSeat };
    }),
    alive: alive.size,
    total: tile.seats.length,
    drama,
    flags: flags.map((f) => f.name),
    thinking: s === null || (night && !narratorView) ? null : s.thinking,
    timeouts: s?.timeouts ?? 0,
    speech: said ? { ...said, speaker: speaker ? spectatorLabel(speaker) : `Seat ${said.seat}`, name: speaker ? speaker.displayName : `Seat ${said.seat}` } : null,
    cost: costText(s),
    over,
    kicker: {
      match: matchLabel(tile),
      chip: s === null ? null : over ? "END" : `${s.phase.charAt(0)}${s.round ?? ""}`,
      step: over ? null : step,
      // Small tiles say just "Night", never the Narrator's View Night step.
      stepShort: over || step === null ? null : night ? "Night" : shortStep(step),
    },
    headline:
      s === null
        ? "Starting"
        : over
          ? s.result
            ? resultLine(s.result)
            : "Over"
          : (headlineFlag?.name ?? (night ? "Night falls" : s.step === "Vote" ? "The table votes" : (step ?? s.phase))),
    also: others.length > 0 ? { flag: others[0]!, more: others.length - 1 } : null,
    fill: night ? "night" : s === null ? "starting" : !over && (s.dramaScore ?? 0) >= HOT_DRAMA ? "hot" : "plain",
    dramaText: drama === null ? "—" : `${drama}%`,
  };
}

/** The Match's measured cost so far (wl-64dn's `MatchSummary.cost`, USD), when the summary carries one. */
function costText(s: MatchTile["summary"]): string | null {
  const cost = s?.cost;
  return typeof cost === "number" ? formatUsd(cost) : null;
}
