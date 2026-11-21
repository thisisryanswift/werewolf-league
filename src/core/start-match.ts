// Start a Match from a list of Agents (one per seat). Used by the admin route
// now and by the League DO later.

import type { AgentConfig } from "./harness";
import type { MatchInit } from "./match";
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

export async function startMatch(
  env: Env,
  opts: { matchId?: string; rulesetId?: string; seed?: string; config?: Record<string, unknown>; agents: AgentConfig[] },
): Promise<MatchInit> {
  const matchId = opts.matchId ?? crypto.randomUUID();
  const seats = labelSeats(opts.agents);
  const init: MatchInit = {
    matchId,
    rulesetId: opts.rulesetId ?? "werewolf",
    seed: opts.seed ?? crypto.randomUUID(),
    config: opts.config ?? {},
    seats,
    agents: Object.fromEntries(opts.agents.map((a, i) => [i + 1, a])),
  };
  await env.MATCH.getByName(matchId).start(init);
  return init;
}
