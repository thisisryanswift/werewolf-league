// Ruleset registry: the only place that names concrete Rulesets.

import type { Ruleset } from "../core/ruleset";
import { werewolf } from "./werewolf";

const RULESETS: Record<string, Ruleset<unknown>> = {
  werewolf: werewolf as Ruleset<unknown>,
};

export function getRuleset(id: string): Ruleset<unknown> {
  const r = RULESETS[id];
  if (!r) throw new Error(`Unknown ruleset: ${id}`);
  return r;
}
