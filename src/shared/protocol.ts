// Wire protocol shared by the Worker and the frontend. Ruleset-agnostic.

/** Who may see an event: everyone, or only these seats (Narrator's View sees all). */
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
  /** `matchNumber` is the Match's Match Number, absent if its League didn't number it. */
  | { type: "log"; matchId: string; matchNumber?: number; events: MatchEvent[] }
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
 * supplies the public fields (and `narratorView`); the Match runner adds the Narrator's
 * Drama fields. `narratorView` and secret Drama Flags are sent to every Spectator and
 * hidden client-side when Narrator's View is off (see `visibleDramaFlags`), like private
 * Match events.
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
  /** The Ruleset's name for the current step within the phase (e.g. "Vote"), or null. */
  step: string | null;
  /**
   * Private information for Narrator's View only (e.g. each seat's role). Like the
   * Match feed, it is sent to every Spectator and hidden client-side when Narrator's View is off.
   */
  narratorView?: { roles: Record<number, string>; step?: string | null };
  /** Narrator Drama Score from 0 (calm) to 1 (explosive); absent before the first narration. */
  dramaScore?: number;
  /** Active Drama Flags of the latest narration; absent before the first narration. */
  dramaFlags?: TileDramaFlag[];
  /** Measured USD spent on the Match so far (Players and Narrator); absent before any usage is reported. */
  cost?: number;
  /** The winning Side's display name once the Match is over (e.g. "Werewolves"); absent before. */
  result?: string;
}

/**
 * Everything a grid tile shows: the Ruleset's summary plus counts the Match
 * runner derives from its own events (the Drama fields are on MatchSummary).
 */
export interface TileSummary extends MatchSummary {
  /** Players whose turn is in flight (a count only, so it never says who). */
  thinking: number;
  /** Turns timed out so far in this Match, all seats. */
  timeouts: number;
}

/** Public-safe Drama Flags are shown to everyone; secret ones only in Narrator's View. */
export type DramaFlagVisibility = "public-safe" | "secret";

/** An active Drama Flag on a tile (set by the Narrator). */
export interface TileDramaFlag {
  id: string;
  visibility: DramaFlagVisibility;
}

/** The Drama Flags a Spectator may see: all of them in Narrator's View, else only public-safe ones. */
export function visibleDramaFlags<F extends { visibility: DramaFlagVisibility }>(flags: F[], narratorView: boolean): F[] {
  return narratorView ? flags : flags.filter((f) => f.visibility === "public-safe");
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
  /** Match Number: the League numbers the Matches it starts 1, 2, 3, ... Absent on older Matches. */
  matchNumber?: number;
  seed: string;
  /** "starting" until its Match DO has started. */
  status: "starting" | "running";
  seats: TileSeat[];
  /** Null until the Match first reports a summary. */
  summary: TileSummary | null;
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
  /** Start pacing: at most this many new Matches in any `startWindowMs` window. */
  startsPerWindow: number;
  startWindowMs: number;
  /** How long new starts stop after a Player reports a 429. */
  backoffMs: number;
  /** Minimum time between League feed messages. */
  feedIntervalMs: number;
  roster: RosterAgent[];
  /** Total League spend (USD) at which the League pauses itself; null for no cap. */
  spendCap: number | null;
}

/** A Player's model API call refused with a 429, as reported to the League. */
export interface RateLimitEvent {
  matchId: string;
  seat: number;
  agentId: string;
  /** Which Harness call hit it, e.g. "provision", "startTurn" or "poll". */
  source: string;
  /** League clock time of the report. */
  at: number;
}

/** A recently settled Match. */
export interface SettledMatch {
  matchId: string;
  /** Match Number, absent on older Matches. */
  matchNumber?: number;
  winner: string;
  settledAt: number;
}

/** The finished Match the grid links to: pinned by an operator, else the most recent. */
export interface FeaturedMatch extends SettledMatch {
  /** True if an operator pinned it; false if it is the most recent by default. */
  pinned: boolean;
}

export interface LeagueSnapshot {
  /** Which League this is. Ratings and spend are this League's only. */
  league: { id: string; name: string };
  config: LeagueConfigView;
  tiles: MatchTile[];
  /** Most recently settled League Matches, newest first. */
  recent: SettledMatch[];
  /** The featured finished Match, or null before any Match has finished. */
  featured: FeaturedMatch | null;
  stats: { started: number; settled: number };
  /** Why the League cannot start Matches right now (e.g. a roster that is too small), else null. */
  blocked: string | null;
  spend: LeagueSpend;
  /** 429 backoff: when new starts resume (null if not backing off), and the reports so far, newest first. */
  rateLimit: { backoffUntil: number | null; count: number; recent: RateLimitEvent[] };
  leaderboard: Leaderboard;
}

/** Measured League spend in USD (Players and Narrator), from the token usage the model APIs report. */
export interface LeagueSpend {
  /** Every settled Match (League and one-off) plus the cost so far of every live League Match. */
  total: number;
  /** `total` minus the total when the League was last resumed. */
  sinceResume: number;
  /** Per Agent, from settled League Matches only (a live Match's per-Agent cost could hint at roles). */
  byAgent: Record<string, number>;
  /** When the League was last resumed (epoch ms); null if never. */
  resumedAt: number | null;
}

/**
 * A Match's measured cost in USD. Public once the Match is over (in its result
 * and its `match_cost` event); while it runs, only the total is shown.
 */
export interface MatchCost {
  /** Players plus Narrator plus Analyst. */
  total: number;
  bySeat: Record<number, number>;
  byAgent: Record<string, number>;
  /** The Narrator's calls: in the total, in no Agent's cost. */
  narrator: number;
  /** The post-Match Analyst's run: in the total, in no Agent's cost. Absent on Matches costed before it existed. */
  analyst?: number;
  /** Tokens over every call; `input` includes `cached`. */
  tokens: { input: number; cached: number; thought: number; output: number };
  /** Models billed with no row in the price table (counted at $0). */
  unpriced: string[];
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
  /** Rated Matches played per Side (once per Match per Side the Agent had a seat on). */
  played: Record<string, number>;
  /** Rated Matches played and won per role id (once per Match per role the Agent held), for the Leaderboard's roles. */
  roles: Record<string, { played: number; won: number }>;
  /** Turns that missed their deadline, summed from each Match result's per-Agent counts. */
  timeouts: number;
  /** Calibration: Brier score over the Agent's village-side beliefs (lower is better); null before any are scored. */
  calibration: number | null;
  /** Mean measured USD per Match for this Agent's seats; null before any costed Match. */
  costPerMatch?: number | null;
}

/** The leaderboard: every current roster Agent plus every Agent with a rated Match. */
export interface Leaderboard {
  /** The Ruleset's Sides, in its order: the rating and win columns. */
  sides: string[];
  /** The Ruleset's roles, in its display order: the per-role win columns. Absent if the Ruleset names none. */
  roles?: { id: string; name: string }[];
  /** False while the League is still recounting role stats from Matches settled before they were kept. */
  rolesComplete?: boolean;
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

/**
 * A tile's changes since the last feed message: a new tile is sent whole; a
 * changed one carries only the changed top-level fields, and `summary` only the
 * changed summary fields (merged shallowly into the client's copy).
 */
export type TileDiff = { matchId: string } & Partial<Omit<MatchTile, "matchId" | "summary">> & {
    summary?: Partial<TileSummary> | null;
  };

/**
 * A coalesced League feed update (at most one per feed interval): per-tile diffs,
 * removed tiles, and any League-wide snapshot fields that changed. `rev` increases
 * by one per message; fold it into the snapshot with `applyLeagueDiff`.
 */
export interface LeagueTilesMessage {
  type: "tiles";
  rev: number;
  tiles: TileDiff[];
  removed: string[];
  league?: Partial<Omit<LeagueSnapshot, "tiles">>;
}

/**
 * Messages sent from the League WebSocket: the full snapshot on join, coalesced
 * "tiles" diffs after it, and a leaderboard message per rated settlement.
 * Consumers switch on `type`.
 */
export type LeagueMessage =
  | { type: "league"; league: LeagueSnapshot }
  | LeagueTilesMessage
  /** Sent once when a rated Match settles: the whole leaderboard after its rating changes. */
  | { type: "leaderboard"; matchId: string; leaderboard: Leaderboard };
