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

/**
 * The pi-open League's roster: OpenRouter models on the pi harness (wl-zst1), each with its own
 * Agent37 sandbox. Hydrogen through OpenRouter is the controlled comparison with the Managed
 * Agent Hydrogen ('Hydrogen · Pi' vs 'Hydrogen · Managed'); it bills the Google key stored on
 * OpenRouter. Ids verified on OpenRouter's public model list on 2026-11-21 (Pi's catalog is stale).
 */
export const PI_MODELS = [
  { id: "hydrogen-pi", name: "Hydrogen · Pi", model: "google/gemini-4-hydrogen" },
  { id: "claude-sonnet-5-5-pi", name: "Claude Sonnet 5.5 · Pi", model: "anthropic/claude-sonnet-5.5" },
  { id: "gpt-6-1-terra-pi", name: "GPT-6.1 Terra · Pi", model: "openai/gpt-6.1-terra" },
  { id: "muse-ember-pi", name: "Muse Ember · Pi", model: "meta/muse-ember" },
  { id: "glm-5-3-flashx-pi", name: "GLM-5.3 FlashX · Pi", model: "z-ai/glm-5.3-flashx" },
  { id: "deepseek-v4-1-flash-pi", name: "DeepSeek V4.1 Flash · Pi", model: "deepseek/deepseek-v4.1-flash" },
  { id: "grok-4-7-pi", name: "Grok 4.7 · Pi", model: "x-ai/grok-4.7" },
] as const;

export function piRoster(): AgentConfig[] {
  return PI_MODELS.map(({ id, name, model }) => ({ id, name, harness: "pi", model }));
}
