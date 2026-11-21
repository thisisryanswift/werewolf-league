// Ruleset registry: the only place that names concrete Rulesets.

import type { Ruleset } from "../core/ruleset";
import type { AgentConfig } from "../core/harness";
import { werewolf } from "./werewolf";
import { piRoster } from "./werewolf/roster";

const RULESETS: Record<string, Ruleset<unknown>> = {
  werewolf: werewolf as Ruleset<unknown>,
};

export const DEFAULT_RULESET_ID = "werewolf";

export function getRuleset(id: string): Ruleset<unknown> {
  const r = RULESETS[id];
  if (!r) throw new Error(`Unknown ruleset: ${id}`);
  return r;
}

/**
 * Rosters a fresh League starts with, by League id; other Leagues start on the
 * fake roster. pi-open seeds the pi Harness Agents (still paused until resumed).
 */
export const LEAGUE_SEED_ROSTERS: Record<string, () => AgentConfig[]> = {
  "pi-open": piRoster,
};
