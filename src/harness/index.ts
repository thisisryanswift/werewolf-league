// Harness registry: picks the implementation named by an Agent's `harness`.

import type { AgentConfig, Harness } from "../core/harness";
import { fakeHarness } from "./fake";
import { MANAGED_AGENT_HARNESS_ID, managedAgentHarness } from "./managed-agent";

const HARNESSES: Record<string, (env: Env) => Harness> = {
  fake: () => fakeHarness,
  [MANAGED_AGENT_HARNESS_ID]: (env) => managedAgentHarness({ apiKey: env.GEMINI_API_KEY }),
};

export function harnessFor(agent: AgentConfig, env: Env): Harness {
  const make = HARNESSES[agent.harness];
  if (!make) throw new Error(`Unknown harness: ${agent.harness}`);
  return make(env);
}
