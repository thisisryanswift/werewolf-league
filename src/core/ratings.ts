// Side Ratings (Elo) and leaderboard standings. Ruleset-agnostic: Sides are the
// Ruleset's Side names. Pure; the League DO stores the results.
//
// Team-average Elo, K=32: each Player's team average is its own Side's average
// rating, and its opponents' average is every other Player's rating on their own
// Side. One update per Player goes to its Agent's Side Rating, so copies count
// per seat; dead Players share their team's result. Every Player is rated from
// the same pre-Match snapshot.

import {
  INITIAL_RATING,
  type AgentRatingChange,
  type AgentStanding,
  type PlayerRatingChange,
  type RatingChanges,
} from "../shared/protocol";
import { calibrationBySeat, type BrierTally } from "../shared/beliefs";
import type { MatchResult, SeatAgent } from "./ruleset";

export const K = 32;

/** Side Ratings per Agent: agentId -> side -> rating. Missing entries read INITIAL_RATING. */
export type RatingSnapshot = Record<string, Record<string, number>>;

/** What the League stores per Agent. */
export interface AgentRecord {
  name: string;
  ratings: Record<string, number>;
  matches: number;
  wins: Record<string, number>;
  /** Rated Matches played per Side: once per Side the Agent had a seat on in the Match (absent on records from before it; the League backfills it). */
  played?: Record<string, number>;
  timeouts: number;
  /** Running Brier tally over the Agent's scored beliefs (absent on records from before Calibration). */
  brier?: BrierTally;
  /** Rated Matches played and won per role id: once per Match per role the Agent held (absent before role stats; the League backfills it). */
  roles?: RoleStats;
}

/** Played and won counts per Ruleset role id. */
export type RoleStats = Record<string, { played: number; won: number }>;

/**
 * Which roles each Agent held in one Match, and whether it won in each: a role
 * counts once per Match, won if any of the Agent's Players in that role won.
 */
export function rolesPlayed(
  players: readonly Pick<PlayerRatingChange, "seat" | "agentId" | "won">[],
  roles: Record<number, string>,
): Record<string, Record<string, boolean>> {
  const out: Record<string, Record<string, boolean>> = {};
  for (const p of players) {
    const role = roles[p.seat];
    if (role === undefined) continue;
    const held = (out[p.agentId] ??= {});
    held[role] = (held[role] ?? false) || p.won;
  }
  return out;
}

/** Add one Match's roles (role id -> won) to an Agent's tallies. */
export function addRoleStats(prev: RoleStats | undefined, match: Record<string, boolean>): RoleStats {
  const out = { ...prev };
  for (const [role, won] of Object.entries(match)) {
    const cur = out[role] ?? { played: 0, won: 0 };
    out[role] = { played: cur.played + 1, won: cur.won + (won ? 1 : 0) };
  }
  return out;
}

const ratingOf = (snap: RatingSnapshot, agentId: string, side: string): number => snap[agentId]?.[side] ?? INITIAL_RATING;
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The Side Ratings of these Agents, for a pre-Match snapshot. */
export function snapshotOf(records: Record<string, AgentRecord>, agentIds: string[]): RatingSnapshot {
  return Object.fromEntries([...new Set(agentIds)].map((id) => [id, { ...records[id]?.ratings }]));
}

/** Each Player's rating change, all from one snapshot. */
export function ratePlayers(opts: {
  seats: SeatAgent[];
  sides: Record<number, string>;
  winner: string;
  snapshot: RatingSnapshot;
}): PlayerRatingChange[] {
  const players = opts.seats
    .filter((s) => opts.sides[s.seat] !== undefined)
    .map((s) => {
      const side = opts.sides[s.seat]!;
      return { seat: s.seat, agentId: s.agentId, side, rating: ratingOf(opts.snapshot, s.agentId, side) };
    });
  return players.map((p) => {
    const own = mean(players.filter((q) => q.side === p.side).map((q) => q.rating));
    const opponents = players.filter((q) => q.side !== p.side).map((q) => q.rating);
    const won = p.side === opts.winner;
    // A Match with only one Side has no opponents: nothing to learn.
    const delta = opponents.length === 0 ? 0 : K * ((won ? 1 : 0) - 1 / (1 + 10 ** ((mean(opponents) - own) / 400)));
    return { seat: p.seat, agentId: p.agentId, side: p.side, won, before: p.rating, delta };
  });
}

/**
 * Apply Player changes to the current records (which may have moved since the
 * snapshot, if other Matches settled meanwhile). Returns the new records and
 * the per-Agent, per-Side net changes, ordered by Agent then Side order.
 */
export function applyMatch(opts: {
  records: Record<string, AgentRecord>;
  players: PlayerRatingChange[];
  winner: string;
  sideOrder: readonly string[];
  names: Record<string, string>;
  timeoutsByAgent: Record<string, number>;
  /** This Match's Brier tally per Agent (see `calibrationByAgent`). */
  calibrationByAgent?: Record<string, BrierTally>;
  /** Each Player's role id by seat (from the Match result); without it role tallies are left alone. */
  roles?: Record<number, string>;
}): { records: Record<string, AgentRecord>; changes: RatingChanges } {
  const records = { ...opts.records };
  const net = new Map<string, AgentRatingChange>();
  for (const p of opts.players) {
    const key = `${p.agentId}\u0000${p.side}`;
    const cur = net.get(key);
    if (cur) cur.delta += p.delta;
    else {
      const before = records[p.agentId]?.ratings[p.side] ?? INITIAL_RATING;
      net.set(key, { agentId: p.agentId, side: p.side, before, delta: p.delta, after: before });
    }
  }
  const agents = [...net.values()]
    .map((c) => ({ ...c, after: c.before + c.delta }))
    .sort((a, b) => (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : opts.sideOrder.indexOf(a.side) - opts.sideOrder.indexOf(b.side)));

  const held = opts.roles ? rolesPlayed(opts.players, opts.roles) : {};
  for (const agentId of new Set(opts.players.map((p) => p.agentId))) {
    const prev = records[agentId] ?? { name: agentId, ratings: {}, matches: 0, wins: {}, timeouts: 0 };
    const ratings = { ...prev.ratings };
    for (const c of agents) if (c.agentId === agentId) ratings[c.side] = c.after;
    const won = opts.players.some((p) => p.agentId === agentId && p.won);
    const played = { ...prev.played };
    for (const side of new Set(opts.players.filter((p) => p.agentId === agentId).map((p) => p.side))) played[side] = (played[side] ?? 0) + 1;
    records[agentId] = {
      name: opts.names[agentId] ?? prev.name,
      ratings,
      matches: prev.matches + 1,
      wins: won ? { ...prev.wins, [opts.winner]: (prev.wins[opts.winner] ?? 0) + 1 } : prev.wins,
      played,
      timeouts: prev.timeouts + (opts.timeoutsByAgent[agentId] ?? 0),
      brier: addTally(prev.brier, opts.calibrationByAgent?.[agentId]),
      ...(held[agentId] ? { roles: addRoleStats(prev.roles, held[agentId]) } : prev.roles ? { roles: prev.roles } : {}),
    };
  }
  return { records, changes: { players: opts.players, agents } };
}

/** The part of a stored settlement that says who sat on which Side; older settlements may lack `ratings.players`. */
export interface PlayedSource {
  ratings: { players?: { agentId: string; side: string }[] } | null;
  seats: { seat: number; agentId: string }[] | null;
  result: { sides: Record<number, string> };
}

/** Each Agent's (agentId, Side) pairs in one rated settlement, deduplicated; none for an unrated one. */
function sidesPlayed(s: PlayedSource): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!s.ratings) return out;
  const pairs = Array.isArray(s.ratings.players)
    ? s.ratings.players.map((p) => [p.agentId, p.side] as const)
    : (s.seats ?? []).flatMap((x) => (s.result.sides[x.seat] === undefined ? [] : [[x.agentId, s.result.sides[x.seat]!] as const]));
  for (const [agentId, side] of pairs) {
    const set = out.get(agentId) ?? new Set<string>();
    set.add(side);
    out.set(agentId, set);
  }
  return out;
}

/** A stored rated settlement, for counting its roles; older settlements may lack `ratings.players`. */
export interface RolesSource {
  ratings: { players?: { seat: number; agentId: string; won: boolean }[] } | null;
  seats: { seat: number; agentId: string }[] | null;
  result: { winner: string; sides: Record<number, string> };
}

/**
 * Add one settled Match's roles (by seat) to the records of the Agents that
 * played it. Unrated settlements, and Agents without a record, are skipped.
 */
export function addSettlementRoles(records: Record<string, AgentRecord>, s: RolesSource, roles: Record<number, string>): Record<string, AgentRecord> {
  if (!s.ratings) return records;
  const players = Array.isArray(s.ratings.players)
    ? s.ratings.players
    : (s.seats ?? []).map((x) => ({ seat: x.seat, agentId: x.agentId, won: s.result.sides[x.seat] === s.result.winner }));
  const out = { ...records };
  for (const [agentId, held] of Object.entries(rolesPlayed(players, roles))) {
    const r = out[agentId];
    if (r) out[agentId] = { ...r, roles: addRoleStats(r.roles, held) };
  }
  return out;
}

/** True if any record predates per-Side `played` counts and needs `backfillPlayed`. */
export const needsPlayedBackfill = (records: Record<string, AgentRecord>): boolean => Object.values(records).some((r) => !r.played);

/**
 * Give every record lacking `played` its count from the stored settlements:
 * once per rated Match per Side the Agent sat on. Records that already have
 * `played` are left alone, so running it twice changes nothing.
 */
export function backfillPlayed(records: Record<string, AgentRecord>, settlements: Iterable<PlayedSource>): Record<string, AgentRecord> {
  const missing = Object.keys(records).filter((id) => !records[id]!.played);
  if (missing.length === 0) return records;
  const counts: Record<string, Record<string, number>> = Object.fromEntries(missing.map((id) => [id, {}]));
  for (const s of settlements) {
    for (const [agentId, sides] of sidesPlayed(s)) {
      const c = counts[agentId];
      if (c) for (const side of sides) c[side] = (c[side] ?? 0) + 1;
    }
  }
  const out = { ...records };
  for (const id of missing) out[id] = { ...records[id]!, played: counts[id]! };
  return out;
}

const addTally = (a: BrierTally | undefined, b: BrierTally | undefined): BrierTally => ({
  sum: (a?.sum ?? 0) + (b?.sum ?? 0),
  n: (a?.n ?? 0) + (b?.n ?? 0),
});

/**
 * A Match's Brier tally per Agent: every ballot its Players cast from a Side
 * other than the belief Side, summed over its seats. Empty if the Ruleset
 * collects no ballots.
 */
export function calibrationByAgent(
  seats: SeatAgent[],
  result: Pick<MatchResult, "ballots" | "sides" | "beliefSide">,
): Record<string, BrierTally> {
  if (!result.ballots || result.beliefSide === undefined) return {};
  const bySeat = calibrationBySeat({ ballots: result.ballots, sides: result.sides, beliefSide: result.beliefSide });
  const out: Record<string, BrierTally> = {};
  for (const s of seats) {
    const t = bySeat[s.seat];
    if (t) out[s.agentId] = addTally(out[s.agentId], t);
  }
  return out;
}

/** An Agent's leaderboard row. */
export function standing(
  agentId: string,
  name: string,
  record: AgentRecord | undefined,
  sides: readonly string[],
  roleIds: readonly string[] = [],
): AgentStanding {
  const roles = Object.fromEntries(roleIds.map((r) => [r, record?.roles?.[r] ?? { played: 0, won: 0 }]));
  const ratings = Object.fromEntries(sides.map((s) => [s, record?.ratings[s] ?? INITIAL_RATING]));
  const wins = Object.fromEntries(sides.map((s) => [s, record?.wins[s] ?? 0]));
  const played = Object.fromEntries(sides.map((s) => [s, record?.played?.[s] ?? 0]));
  return {
    agentId,
    name,
    ratings,
    overall: sides.length ? mean(sides.map((s) => ratings[s]!)) : INITIAL_RATING,
    matches: record?.matches ?? 0,
    wins,
    played,
    roles,
    timeouts: record?.timeouts ?? 0,
    calibration: record?.brier?.n ? record.brier.sum / record.brier.n : null,
  };
}

/** Rank by Overall Rating (highest first), then by Agent ID for a stable order. */
export function rankStandings(rows: AgentStanding[]): AgentStanding[] {
  return [...rows].sort((a, b) => b.overall - a.overall || (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0));
}
