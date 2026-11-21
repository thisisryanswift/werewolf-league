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
 * A ruleset-agnostic, public summary of a live Match for its grid tile.
 * The Ruleset supplies it; it never contains private information.
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
}

/** One seat of a Match as shown on a tile. */
export interface TileSeat {
  seat: number;
  agentId: string;
  label: string;
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

export interface LeagueSnapshot {
  config: LeagueConfigView;
  tiles: MatchTile[];
  /** Most recently settled League Matches, newest first. */
  recent: SettledMatch[];
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
  // wl-bfo1: Calibration (Brier) belongs here, e.g. `calibration: number | null`.
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

/** Messages sent from the League WebSocket: the full snapshot, on join and on every change. */
export type LeagueMessage = { type: "league"; league: LeagueSnapshot };
