// Narrator registry: picks the implementation named by a Match's NarratorConfig.

import type { Narrator, NarratorConfig } from "../core/narrator";
import { decisionsNarrator } from "./decisions";
import { fakeNarrator } from "./fake";

const NARRATORS: Record<string, (config: NarratorConfig, env: Env) => Narrator> = {
  fake: (c) => fakeNarrator(c.options),
  decisions: (_c, env) => decisionsNarrator({ apiKey: env.GEMINI_API_KEY ?? "" }),
};

export function narratorFor(config: NarratorConfig, env: Env): Narrator {
  const make = NARRATORS[config.id];
  if (!make) throw new Error(`Unknown narrator: ${config.id}`);
  return make(config, env);
}

/** Check an operator-supplied Narrator config; null when valid. */
export function narratorConfigError(c: unknown): string | null {
  const x = c as Record<string, unknown>;
  if (typeof x !== "object" || x === null || typeof x.id !== "string" || !(x.id in NARRATORS)) {
    return `narrator must be null or { id: ${Object.keys(NARRATORS).map((k) => `"${k}"`).join(" | ")}, threshold?, timeoutMs?, options? }`;
  }
  if (x.threshold !== undefined && !(typeof x.threshold === "number" && x.threshold >= 0 && x.threshold <= 1)) {
    return "narrator.threshold must be a number from 0 to 1";
  }
  if (x.timeoutMs !== undefined && !(typeof x.timeoutMs === "number" && x.timeoutMs > 0)) {
    return "narrator.timeoutMs must be a positive number";
  }
  return null;
}
