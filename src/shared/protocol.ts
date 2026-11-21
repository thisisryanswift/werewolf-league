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
  /** The Ruleset's name for the current step within the phase (e.g. "Vote"), or null. */
  step: string | null;
  /**
   * Private information for God View only (e.g. each seat's role). Like the
   * Match feed, it is sent to every Spectator and hidden client-side when God View is off.
   */
  godView?: { roles: Record<number, string>; step?: string | null };
}

/** A Drama Flag on a tile (set by the Narrator, wl-pbkx). Secret flags are God View only. */
export interface TileDramaFlag {
  id: string;
  visibility: "public" | "secret";
}

/**
 * Everything a grid tile shows: the Ruleset's summary plus counts the Match
 * runner derives from its own events.
 */
export interface TileSummary extends MatchSummary {
  /** Players whose turn is in flight (a count only, so it never says who). */
  thinking: number;
  /** Turns timed out so far in this Match, all seats. */
  timeouts: number;
  /** Narrator Drama Score from 0 to 1; absent until the Narrator lands. */
  dramaScore?: number;
  /** Active Drama Flags; absent until the Narrator lands. */
  dramaFlags?: TileDramaFlag[];
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
  /** 429 backoff: when new starts resume (null if not backing off), and the reports so far, newest first. */
  rateLimit: { backoffUntil: number | null; count: number; recent: RateLimitEvent[] };
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
 * Messages sent from the League WebSocket: the full snapshot on join, then
 * coalesced "tiles" diffs. Consumers switch on `type`.
 */
export type LeagueMessage = { type: "league"; league: LeagueSnapshot } | LeagueTilesMessage;
