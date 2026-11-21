// Everything a Player was actually sent over the (stubbed) Interactions API, and a
// check that none of it reveals which Agent sits in any seat.

import { expect } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import type { StubInteractionsApi } from "../harness/stub-interactions-api";

/**
 * Every text an Agent saw, one entry per create() request: its `input` (the string
 * prompt, or its function_results with errors, notes and observations), its tools,
 * and its environment config (the provision request mounts the Agent Instructions as
 * /.agents/AGENTS.md through an inline source). `agent_config` is left out: it carries
 * the model id to the API, not to the Agent.
 */
export function playerTexts(api: StubInteractionsApi): string[] {
  return api.creates().map((b) => {
    const input = typeof b.input === "string" ? b.input : JSON.stringify(b.input);
    const environment = typeof b.environment === "object" ? JSON.stringify(b.environment) : "";
    return `${input}\n${JSON.stringify(b.tools ?? [])}\n${environment}`;
  });
}

/** The mounted AGENTS.md contents found in the scanned requests. */
export function mountedInstructions(api: StubInteractionsApi): string[] {
  return api
    .creates()
    .flatMap((b) => (typeof b.environment === "object" ? (b.environment.sources ?? []) : []))
    .filter((s: any) => s.target === "/.agents/AGENTS.md")
    .map((s: any) => String(s.content));
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
