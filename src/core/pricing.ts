// Price config: list prices per model, in USD per 1M tokens (FINDINGS.md section 9,
// paid tier). 3.6 and 3.8 Flash double on 2027-01-01; update the table then.
// Cost = uncached input × input + cached × cached + (output + thought) × output.

import type { MatchCost } from "../shared/protocol";
import { mergeModelUsage, totalUsage, type ModelUsage, type Usage } from "./usage";

export interface ModelPrice {
  /** USD per 1M uncached input tokens. */
  input: number;
  /** USD per 1M cached input tokens. */
  cached: number;
  /** USD per 1M output tokens; thought tokens bill as output. */
  output: number;
}

export const PRICES: Record<string, ModelPrice> = {
  "gemini-4-hydrogen": { input: 1.5, cached: 0.075, output: 7.5 },
  // Carbon and Argon double on 2026-12-01; Neon as priced in FINDINGS round 2.
  "gemini-4-neon": { input: 3, cached: 0.15, output: 15 },
  "gemini-4-carbon": { input: 2, cached: 0.1, output: 10 },
  "gemini-4-argon": { input: 2, cached: 0.1, output: 10 },
  "gemini-3.8-flash": { input: 0.75, cached: 0.075, output: 3.75 },
  "gemini-3.6-flash": { input: 0.75, cached: 0.075, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, cached: 0.03, output: 2.5 },
  // Decisions bills input only; it reports no cached tokens, so cached is priced as input.
  "gemini-decision-1": { input: 0.1, cached: 0.1, output: 0 },
  // OpenRouter (pi harness), per OpenRouter's public model list on 2026-11-21. Haiku 5.5's
  // >100k-token prompt tier is not modelled; pi turns stay far below it.
  "google/gemini-4-hydrogen": { input: 1.5, cached: 0.075, output: 7.5 },
  "anthropic/claude-haiku-5.5": { input: 0.1, cached: 0.01, output: 0.5 },
  "deepseek/deepseek-v4.1-flash": { input: 0.0498, cached: 0.000996, output: 0.1992 },
  // The Fake Harness and fake Narrator call no model.
  fake: { input: 0, cached: 0, output: 0 },
};

/** USD for one usage reading at a model's price. */
export function costOf(u: Usage, p: ModelPrice): number {
  const uncached = Math.max(0, u.input - u.cached);
  return (uncached * p.input + u.cached * p.cached + (u.output + u.thought) * p.output) / 1_000_000;
}

/** USD for per-model token totals; models missing from the table cost 0 and are named in `unpriced`. */
export function priceUsage(m: ModelUsage, table: Record<string, ModelPrice> = PRICES): { cost: number; unpriced: string[] } {
  let cost = 0;
  const unpriced: string[] = [];
  for (const [model, u] of Object.entries(m)) {
    const p = table[model];
    if (p) cost += costOf(u, p);
    else unpriced.push(model);
  }
  return { cost, unpriced };
}

/** Token totals a Match has been billed: per seat (each seat's cumulative report) and for its Narrator. */
export interface MatchUsage {
  bySeat: Record<number, ModelUsage>;
  narrator: ModelUsage;
  /** The post-Match Analyst's cumulative usage (its Player DO's latest report). */
  analyst?: ModelUsage;
}

/** Price a Match's usage per Player, per Agent and in total. Every seat and Agent appears, zeros included. */
export function matchCost(u: MatchUsage, seats: { seat: number; agentId: string }[]): MatchCost {
  const bySeat: Record<number, number> = {};
  const byAgent: Record<string, number> = {};
  const unpriced = new Set<string>();
  let all: ModelUsage = {};
  for (const s of seats) {
    const usage = u.bySeat[s.seat] ?? {};
    const priced = priceUsage(usage);
    priced.unpriced.forEach((m) => unpriced.add(m));
    bySeat[s.seat] = priced.cost;
    byAgent[s.agentId] = (byAgent[s.agentId] ?? 0) + priced.cost;
    all = mergeModelUsage(all, usage);
  }
  const narrator = priceUsage(u.narrator);
  narrator.unpriced.forEach((m) => unpriced.add(m));
  all = mergeModelUsage(all, u.narrator);
  const analyst = priceUsage(u.analyst ?? {});
  analyst.unpriced.forEach((m) => unpriced.add(m));
  all = mergeModelUsage(all, u.analyst ?? {});
  const players = Object.values(bySeat).reduce((a, b) => a + b, 0);
  return {
    total: players + narrator.cost + analyst.cost,
    bySeat,
    byAgent,
    narrator: narrator.cost,
    analyst: analyst.cost,
    tokens: totalUsage(all),
    unpriced: [...unpriced].sort(),
  };
}
