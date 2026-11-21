// The real League roster: one Managed Agent per Gemini model, all sharing the
// Werewolf Agent Instructions (docs/agent-instructions/werewolf.md). Pure, so the
// operator script (scripts/apply-roster.mjs) and tests can both build it.

import type { AgentConfig } from "../../core/harness";

/** One Agent per model. Model IDs as measured in managed-agents-testing FINDINGS.md. */
export const REAL_MODELS = [
  { id: "hydrogen", name: "Hydrogen", model: "gemini-4-hydrogen" },
  { id: "flash-3-8", name: "3.8 Flash", model: "gemini-3.8-flash" },
  { id: "flash-3-6", name: "3.6 Flash", model: "gemini-3.6-flash" },
  { id: "flash-lite-3-5", name: "3.5 Flash-Lite", model: "gemini-3.5-flash-lite" },
] as const;

/** A section marker on its own line, e.g. `<!-- section: shared -->`. */
const SECTION_MARKER = /^<!-- section: [\w-]+ -->$/m;

/**
 * The part of the instructions file an Agent sees: everything from the first
 * section marker line on, unmodified. The text above it is for humans.
 */
export function agentInstructions(markdown: string): string {
  const m = SECTION_MARKER.exec(markdown);
  if (!m) throw new Error("Agent Instructions have no <!-- section: NAME --> marker line");
  return markdown.slice(m.index).trim();
}

/** The real roster, given the instructions file's text. */
export function realRoster(instructionsMarkdown: string): AgentConfig[] {
  const instructions = agentInstructions(instructionsMarkdown);
  return REAL_MODELS.map(({ id, name, model }) => ({ id, name, harness: "managed-agent", model, instructions }));
}
