// Harness registry: picks the implementation named by an Agent's `harness`.
// The Managed Agent harness registers here when it lands.

import type { AgentConfig, Harness } from "../core/harness";
import { fakeHarness } from "./fake";

const HARNESSES: Record<string, (env: Env) => Harness> = {
  fake: () => fakeHarness,
};

export function harnessFor(agent: AgentConfig, env: Env): Harness {
  const make = HARNESSES[agent.harness];
  if (!make) throw new Error(`Unknown harness: ${agent.harness}`);
  return make(env);
}
