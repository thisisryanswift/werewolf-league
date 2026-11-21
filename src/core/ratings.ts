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
  timeouts: number;
  /** Running Brier tally over the Agent's scored beliefs (absent on records from before Calibration). */
  brier?: BrierTally;
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

  for (const agentId of new Set(opts.players.map((p) => p.agentId))) {
    const prev = records[agentId] ?? { name: agentId, ratings: {}, matches: 0, wins: {}, timeouts: 0 };
    const ratings = { ...prev.ratings };
    for (const c of agents) if (c.agentId === agentId) ratings[c.side] = c.after;
    const won = opts.players.some((p) => p.agentId === agentId && p.won);
    records[agentId] = {
      name: opts.names[agentId] ?? prev.name,
      ratings,
      matches: prev.matches + 1,
      wins: won ? { ...prev.wins, [opts.winner]: (prev.wins[opts.winner] ?? 0) + 1 } : prev.wins,
      timeouts: prev.timeouts + (opts.timeoutsByAgent[agentId] ?? 0),
      brier: addTally(prev.brier, opts.calibrationByAgent?.[agentId]),
    };
  }
  return { records, changes: { players: opts.players, agents } };
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
export function standing(agentId: string, name: string, record: AgentRecord | undefined, sides: readonly string[]): AgentStanding {
  const ratings = Object.fromEntries(sides.map((s) => [s, record?.ratings[s] ?? INITIAL_RATING]));
  const wins = Object.fromEntries(sides.map((s) => [s, record?.wins[s] ?? 0]));
  return {
    agentId,
    name,
    ratings,
    overall: sides.length ? mean(sides.map((s) => ratings[s]!)) : INITIAL_RATING,
    matches: record?.matches ?? 0,
    wins,
    timeouts: record?.timeouts ?? 0,
    calibration: record?.brier?.n ? record.brier.sum / record.brier.n : null,
  };
}

/** Rank by Overall Rating (highest first), then by Agent ID for a stable order. */
export function rankStandings(rows: AgentStanding[]): AgentStanding[] {
  return [...rows].sort((a, b) => b.overall - a.overall || (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0));
}
