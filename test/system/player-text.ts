// Everything a Player was actually sent over the (stubbed) Interactions API, and a
// check that none of it reveals which Agent sits in any seat.

import { expect } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import type { StubInteractionsApi } from "../harness/stub-interactions-api";

/**
 * Every text an Agent saw, one entry per create() request: its `input` (the string
 * prompt, or its function_results with errors, notes and observations) and its tools.
 * `agent_config` is left out: it carries the model id to the API, not to the Agent.
 */
export function playerTexts(api: StubInteractionsApi): string[] {
  return api.creates().map((b) => {
    const input = typeof b.input === "string" ? b.input : JSON.stringify(b.input);
    return `${input}\n${JSON.stringify(b.tools ?? [])}`;
  });
}

/** Strings that would reveal an Agent: its name (and so every copy label), id and model id. */
export function identities(agents: AgentConfig[]): string[] {
  const out = new Set<string>();
  for (const a of agents) {
    out.add(a.name);
    out.add(a.id);
    if (a.model) out.add(a.model);
  }
  return [...out];
}

/** Assert no Player text contains a roster Agent name, id, model id or copy label. */
export function expectNoAgentIdentity(texts: string[], agents: AgentConfig[], copyLabels: string[] = []): void {
  expect(texts.length).toBeGreaterThan(0);
  const banned = [...identities(agents), ...copyLabels].map((s) => s.toLowerCase());
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const b of banned) expect(lower.includes(b), `Player text contains "${b}":\n${text.slice(0, 400)}`).toBe(false);
  }
}
