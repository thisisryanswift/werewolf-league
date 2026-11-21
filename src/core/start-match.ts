// Start a Match from a list of Agents (one per seat). Used by the admin route
// and the League DO.

import { DEFAULT_RULESET_ID } from "../rulesets";
import type { DeadlineConfig } from "./deadlines";
import { drawDisplayNames } from "./display-names";
import type { AgentConfig } from "./harness";
import type { MatchInit } from "./match";
import type { NarratorConfig } from "./narrator";
import type { SeatAgent } from "./ruleset";

/**
 * Seats for a table: a copy label numbering copies when an Agent fills several seats
 * ("Hydrogen #2"), and a Display Name drawn from the match seed.
 */
export function labelSeats(agents: AgentConfig[], seed: string): SeatAgent[] {
  const names = drawDisplayNames(seed, agents.length, agents.flatMap((a) => [a.name, a.id]));
  const total = new Map<string, number>();
  for (const a of agents) total.set(a.id, (total.get(a.id) ?? 0) + 1);
  const seen = new Map<string, number>();
  return agents.map((a, i) => {
    const n = (seen.get(a.id) ?? 0) + 1;
    seen.set(a.id, n);
    return {
      seat: i + 1,
      agentId: a.id,
      label: total.get(a.id)! > 1 ? `${a.name} #${n}` : a.name,
      displayName: names[i]!,
    };
  });
}

export interface MatchOptions {
  matchId?: string;
  rulesetId?: string;
  seed?: string;
  config?: Record<string, unknown>;
  /** Turn deadlines; missing values use the defaults. */
  deadlines?: Partial<DeadlineConfig>;
  /** The Narrator for the Match; absent or null means none. */
  narrator?: NarratorConfig | null;
  /** The League (by id) the Match reports to; absent means the default League. */
  league?: string;
  agents: AgentConfig[];
}

/** The MatchInit for a table, with a fresh Match ID and seed unless given. */
export function buildMatchInit(opts: MatchOptions): MatchInit {
  const matchId = opts.matchId ?? crypto.randomUUID();
  const seed = opts.seed ?? crypto.randomUUID();
  const seats = labelSeats(opts.agents, seed);
  return {
    matchId,
    rulesetId: opts.rulesetId ?? DEFAULT_RULESET_ID,
    seed,
    config: opts.config ?? {},
    ...(opts.deadlines ? { deadlines: opts.deadlines } : {}),
    ...(opts.narrator ? { narrator: opts.narrator } : {}),
    ...(opts.league ? { league: opts.league } : {}),
    seats,
    agents: Object.fromEntries(opts.agents.map((a, i) => [i + 1, a])),
  };
}

export async function startMatch(env: Env, opts: MatchOptions): Promise<MatchInit> {
  const init = buildMatchInit(opts);
  await env.MATCH.getByName(init.matchId).start(init);
  return init;
}
