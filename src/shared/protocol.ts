// Wire protocol shared by the Worker and the frontend. Ruleset-agnostic.

/** Who may see an event: everyone, or only these seats (God View sees all). */
export type EventAudience = "all" | number[];

/** An event as produced by a Ruleset (or the Match runner). */
export interface RulesetEvent {
  kind: string;
  audience: EventAudience;
  data: Record<string, unknown>;
}

/** A committed event: strictly increasing `seq` within a Match. `ts` is operational. */
export interface MatchEvent extends RulesetEvent {
  seq: number;
  ts: number;
}

/** Messages sent from the Match WebSocket to a Spectator. */
export type ServerMessage =
  | { type: "log"; matchId: string; events: MatchEvent[] }
  | { type: "event"; event: MatchEvent };

/**
 * Merge incoming events into a seq-ordered log, dropping any seq already
 * present. Clients use this to dedupe across the join log, live events and
 * reconnects.
 */
export function mergeEvents(existing: MatchEvent[], incoming: MatchEvent[]): MatchEvent[] {
  const bySeq = new Map<number, MatchEvent>();
  for (const e of existing) bySeq.set(e.seq, e);
  for (const e of incoming) if (!bySeq.has(e.seq)) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

// ---- League feed ------------------------------------------------------

/**
 * A ruleset-agnostic summary of a live Match for its grid tile. The Ruleset
 * supplies the public fields; the Match runner adds the Narrator's Drama fields.
 * Secret Drama Flags are sent to every Spectator and hidden client-side when
 * God View is off (see `visibleDramaFlags`), like private Match events.
 */
export interface MatchSummary {
  /** Display name of the current phase, e.g. "Day" or "Night"; "Over" once finished. */
  phase: string;
  /** The phase's number (Day 2 -> 2), if the Ruleset numbers its phases. */
  round: number | null;
  /** Seats still in the game. */
  alive: number[];
  /** The latest public speech line, if any. */
  latestSpeech: { seat: number; text: string } | null;
  /** Narrator Drama Score from 0 (calm) to 1 (explosive); absent before the first narration. */
  dramaScore?: number;
  /** Active Drama Flags of the latest narration; absent before the first narration. */
  dramaFlags?: TileDramaFlag[];
}

/** Public-safe Drama Flags are shown to everyone; secret ones only in God View. */
export type DramaFlagVisibility = "public-safe" | "secret";

/** An active Drama Flag on a tile (set by the Narrator). */
export interface TileDramaFlag {
  id: string;
  visibility: DramaFlagVisibility;
}

/** The Drama Flags a Spectator may see: all of them in God View, else only public-safe ones. */
export function visibleDramaFlags<F extends { visibility: DramaFlagVisibility }>(flags: F[], godView: boolean): F[] {
  return godView ? flags : flags.filter((f) => f.visibility === "public-safe");
}

/** One seat of a Match as shown on a tile. */
export interface TileSeat {
  seat: number;
  agentId: string;
  /** Agent and copy label, e.g. "Hydrogen #2". */
  label: string;
  /** The seat's Display Name, e.g. "Mara". */
  displayName: string;
}

/** A live Match on the League grid. */
export interface MatchTile {
  matchId: string;
  seed: string;
  /** "starting" until its Match DO has started. */
  status: "starting" | "running";
  seats: TileSeat[];
  /** Null until the Match first reports a summary. */
  summary: MatchSummary | null;
  startedAt: number;
}

/** Public view of a League Agent (no Agent Instructions or harness options). */
export interface RosterAgent {
  id: string;
  name: string;
  harness: string;
  model?: string;
}

export interface LeagueConfigView {
  /** Matches kept live at once. */
  n: number;
  paused: boolean;
  /** Seats per Match. */
  seats: number;
  rulesetId: string;
  roster: RosterAgent[];
}

/** A recently settled Match. */
export interface SettledMatch {
  matchId: string;
  winner: string;
  settledAt: number;
}

/** The finished Match the grid links to: pinned by an operator, else the most recent. */
export interface FeaturedMatch extends SettledMatch {
  /** True if an operator pinned it; false if it is the most recent by default. */
  pinned: boolean;
}

export interface LeagueSnapshot {
  config: LeagueConfigView;
  tiles: MatchTile[];
  /** Most recently settled League Matches, newest first. */
  recent: SettledMatch[];
  /** The featured finished Match, or null before any Match has finished. */
  featured: FeaturedMatch | null;
  stats: { started: number; settled: number };
  /** Why the League cannot start Matches right now (e.g. a roster that is too small), else null. */
  blocked: string | null;
  leaderboard: Leaderboard;
}

// ---- Ratings ------------------------------------------------------------

/** Every Side Rating starts here. */
export const INITIAL_RATING = 1200;

/**
 * One Agent's League standing. Ratings and win counts are keyed by Side (the
 * Ruleset's Side names, e.g. "wolf" and "village"); a Side never played reads
 * INITIAL_RATING / 0. Ratings are unrounded; round for display.
 */
export interface AgentStanding {
  agentId: string;
  name: string;
  /** Side Rating per Side. */
  ratings: Record<string, number>;
  /** Overall Rating: the mean of the Agent's Side Ratings. */
  overall: number;
  /** Rated Matches played (an Agent with several seats in one Match counts it once). */
  matches: number;
  /** Rated Matches won per Side (once per Match, on the Side that won). */
  wins: Record<string, number>;
  /** Turns that missed their deadline, summed from each Match result's per-Agent counts. */
  timeouts: number;
  /** Calibration: Brier score over the Agent's village-side beliefs (lower is better); null before any are scored. */
  calibration: number | null;
}

/** The leaderboard: every current roster Agent plus every Agent with a rated Match. */
export interface Leaderboard {
  /** The Ruleset's Sides, in its order: the rating and win columns. */
  sides: string[];
  /** Ranked by Overall Rating, highest first. */
  rows: AgentStanding[];
}

/** One Player's rating update, computed from the pre-Match rating snapshot. */
export interface PlayerRatingChange {
  seat: number;
  agentId: string;
  side: string;
  won: boolean;
  /** The Agent's Side Rating in the pre-Match snapshot. */
  before: number;
  delta: number;
}

/** One Agent's net change on one Side: the sum of its Players' deltas on that Side. */
export interface AgentRatingChange {
  agentId: string;
  side: string;
  /** Side Rating just before this settlement was applied. */
  before: number;
  delta: number;
  after: number;
}

/**
 * A Match's rating changes, stored with its settlement and returned unchanged
 * on any redelivery. Also the data of the Match's `ratings_settled` event.
 */
export interface RatingChanges {
  players: PlayerRatingChange[];
  agents: AgentRatingChange[];
}

/** Messages sent from the League WebSocket: the full snapshot on join and on every change, plus a leaderboard message per rated settlement. */
export type LeagueMessage =
  | { type: "league"; league: LeagueSnapshot }
  /** Sent once when a rated Match settles: the whole leaderboard after its rating changes. */
  | { type: "leaderboard"; matchId: string; leaderboard: Leaderboard };
