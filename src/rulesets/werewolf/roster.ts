// The real League roster: one Managed Agent per Gemini model. The Agents carry no
// instructions of their own, so each seat gets the Ruleset's default Agent
// Instructions (docs/agent-instructions/werewolf.md) narrowed to its role's
// sections. Applied by the operator script scripts/apply-roster.mjs.

import type { AgentConfig } from "../../core/harness";

/** One Agent per model. Model IDs as measured in managed-agents-testing FINDINGS.md. */
export const REAL_MODELS = [
  { id: "hydrogen", name: "Hydrogen", model: "gemini-4-hydrogen" },
  { id: "flash-3-8", name: "3.8 Flash", model: "gemini-3.8-flash" },
  { id: "flash-3-6", name: "3.6 Flash", model: "gemini-3.6-flash" },
  { id: "flash-lite-3-5", name: "3.5 Flash-Lite", model: "gemini-3.5-flash-lite" },
] as const;

export function realRoster(): AgentConfig[] {
  return REAL_MODELS.map(({ id, name, model }) => ({ id, name, harness: "managed-agent", model }));
}
