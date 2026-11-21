// Scoring of normalized belief ballots: Calibration (Brier) and Table Suspicion.
// Ruleset-agnostic: a ballot is a voter's stated probability, per other seat,
// that the seat is on the Ruleset's belief Side (MatchResult.beliefSide). Shared
// by the League (Calibration) and the Match page (Table Suspicion).

/** One normalized ballot: the voter and its belief per other seat (keys may be JSON strings). */
export interface Ballot {
  seat: number;
  beliefs: Record<number | string, number>;
}

/** Brier squared-error total and belief count; Calibration is `sum / n` (lower is better). */
export interface BrierTally {
  sum: number;
  n: number;
}

/**
 * Brier tally per voter seat, over ballots cast by Players who are not on the
 * belief Side (they don't know the truth). Each belief is scored against
 * whether the rated seat is truly on the belief Side.
 */
export function calibrationBySeat(opts: {
  ballots: Ballot[];
  sides: Record<number, string>;
  beliefSide: string;
}): Record<number, BrierTally> {
  const out: Record<number, BrierTally> = {};
  for (const b of opts.ballots) {
    if (opts.sides[b.seat] === undefined || opts.sides[b.seat] === opts.beliefSide) continue;
    const t = (out[b.seat] ??= { sum: 0, n: 0 });
    for (const [seat, p] of Object.entries(b.beliefs)) {
      const truth = opts.sides[Number(seat)] === opts.beliefSide ? 1 : 0;
      t.sum += (p - truth) ** 2;
      t.n += 1;
    }
  }
  return out;
}

/** Table Suspicion per rated seat: the mean belief over every ballot that rates it, and how many did. */
export function tableSuspicion(ballots: Ballot[]): Record<number, { mean: number; ballots: number }> {
  const acc: Record<number, { sum: number; ballots: number }> = {};
  for (const b of ballots) {
    for (const [seat, p] of Object.entries(b.beliefs)) {
      const a = (acc[Number(seat)] ??= { sum: 0, ballots: 0 });
      a.sum += p;
      a.ballots += 1;
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([seat, a]) => [seat, { mean: a.sum / a.ballots, ballots: a.ballots }]));
}
