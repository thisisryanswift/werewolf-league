// Overall Rating history for the leaderboard chart. Ruleset-agnostic and pure:
// replays the rating deltas stored on each rated settlement, in settlement order.
// Each Agent starts from the `before` of its first change in the window (1200 for
// a full history); a Side it has not played reads INITIAL_RATING.

import { INITIAL_RATING, type RatingChanges } from "../shared/protocol";

export interface RatedSettlement {
  matchNumber?: number;
  settledAt: number;
  ratings: RatingChanges | null;
}

export interface RatingsHistoryPoint {
  /** Match Number, or the settlement's position in the window if it has none. */
  matchNumber: number;
  settledAt: number;
  /** Overall Rating of every Agent seen so far, after this settlement; agentId -> rating (0.01 precision, unrounded for display). */
  overall: Record<string, number>;
}

export interface RatingsHistory {
  agents: { agentId: string; name: string }[];
  points: RatingsHistoryPoint[];
}

export const RATINGS_HISTORY_CAP = 500;

export function ratingsHistory(opts: {
  settlements: Iterable<RatedSettlement>;
  sides: readonly string[];
  names: Record<string, string>;
  cap?: number;
}): RatingsHistory {
  const cap = opts.cap ?? RATINGS_HISTORY_CAP;
  const rated = [...opts.settlements]
    .filter((s) => s.ratings && s.ratings.agents.length > 0)
    .sort((a, b) => a.settledAt - b.settledAt || (a.matchNumber ?? 0) - (b.matchNumber ?? 0))
    .slice(-cap);

  // Every Agent in the window starts at its first `before` per Side, so all lines begin together.
  const ratings = new Map<string, Record<string, number>>();
  for (const s of rated) {
    for (const c of s.ratings!.agents) {
      const r = ratings.get(c.agentId) ?? {};
      if (r[c.side] === undefined) r[c.side] = c.before;
      ratings.set(c.agentId, r);
    }
  }
  const overallOf = (r: Record<string, number>) =>
    opts.sides.length ? opts.sides.reduce((sum, side) => sum + (r[side] ?? INITIAL_RATING), 0) / opts.sides.length : INITIAL_RATING;

  const points = rated.map((s, i) => {
    for (const c of s.ratings!.agents) ratings.get(c.agentId)![c.side]! += c.delta;
    const overall: Record<string, number> = {};
    for (const [id, r] of ratings) overall[id] = Math.round(overallOf(r) * 100) / 100;
    return { matchNumber: s.matchNumber ?? i + 1, settledAt: s.settledAt, overall };
  });

  return {
    agents: [...ratings.keys()].sort().map((agentId) => ({ agentId, name: opts.names[agentId] ?? agentId })),
    points,
  };
}
