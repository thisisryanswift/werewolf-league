// Start a Match from a list of Agents (one per seat). Used by the admin route
// and the League DO.

import { DEFAULT_RULESET_ID } from "../rulesets";
import type { DeadlineConfig } from "./deadlines";
import type { AgentConfig } from "./harness";
import type { MatchInit } from "./match";
import type { NarratorConfig } from "./narrator";
import type { SeatAgent } from "./ruleset";

/** Seat labels, numbering copies when an Agent fills several seats ("Hydrogen #2"). */
export function labelSeats(agents: AgentConfig[]): SeatAgent[] {
  const total = new Map<string, number>();
  for (const a of agents) total.set(a.id, (total.get(a.id) ?? 0) + 1);
  const seen = new Map<string, number>();
  return agents.map((a, i) => {
    const n = (seen.get(a.id) ?? 0) + 1;
    seen.set(a.id, n);
    return { seat: i + 1, agentId: a.id, label: total.get(a.id)! > 1 ? `${a.name} #${n}` : a.name };
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
  agents: AgentConfig[];
}

/** The MatchInit for a table, with a fresh Match ID and seed unless given. */
export function buildMatchInit(opts: MatchOptions): MatchInit {
  const matchId = opts.matchId ?? crypto.randomUUID();
  const seats = labelSeats(opts.agents);
  return {
    matchId,
    rulesetId: opts.rulesetId ?? DEFAULT_RULESET_ID,
    seed: opts.seed ?? crypto.randomUUID(),
    config: opts.config ?? {},
    ...(opts.deadlines ? { deadlines: opts.deadlines } : {}),
    ...(opts.narrator ? { narrator: opts.narrator } : {}),
    seats,
    agents: Object.fromEntries(opts.agents.map((a, i) => [i + 1, a])),
  };
}

export async function startMatch(env: Env, opts: MatchOptions): Promise<MatchInit> {
  const init = buildMatchInit(opts);
  await env.MATCH.getByName(init.matchId).start(init);
  return init;
}
