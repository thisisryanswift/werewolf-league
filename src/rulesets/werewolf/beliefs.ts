// Belief normalization for Day votes.
//
// A ballot is a voter's P(werewolf) for each other living seat. It is rescaled to
// sum to `target`, the number of Werewolves among those seats (W for a village
// voter, W-1 for a Werewolf). No value may exceed 1: capped seats are set to 1
// and their excess is spread equally over the uncapped seats, repeated until
// nothing exceeds 1. (Equal rather than proportional spread, so a concentrated
// ballot such as [1, 0, 0, ...] with target 2 is still well-defined.)
// Missing, negative or non-numeric values count as 0; an all-zero or missing
// ballot becomes uniform.

import type { Seat } from "../../core/ruleset";

export function normalizeBeliefs(raw: unknown, others: Seat[], target: number): Record<Seat, number> {
  const given = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const values = others.map((seat) => {
    const v = Number(given[String(seat)]);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  const n = others.length;
  const goal = Math.min(Math.max(target, 0), n);
  const sum = values.reduce((a, b) => a + b, 0);
  let p = sum > 0 ? values.map((v) => (v * goal) / sum) : values.map(() => (n ? goal / n : 0));

  const capped = new Array<boolean>(n).fill(false);
  for (;;) {
    let excess = 0;
    p = p.map((v, i) => {
      if (v > 1) {
        excess += v - 1;
        capped[i] = true;
        return 1;
      }
      return v;
    });
    const open = capped.reduce((k, c) => k + (c ? 0 : 1), 0);
    if (excess <= 1e-12 || open === 0) break;
    p = p.map((v, i) => (capped[i] ? v : v + excess / open));
  }
  return Object.fromEntries(others.map((seat, i) => [seat, p[i]!]));
}
