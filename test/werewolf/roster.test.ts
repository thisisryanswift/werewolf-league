import { describe, expect, it } from "vitest";
import { defaultLeagueConfig, patchConfig } from "../../src/core/roster";
import { MANAGED_AGENT_HARNESS_ID } from "../../src/harness/managed-agent";
import { realRoster } from "../../src/rulesets/werewolf/roster";

describe("Werewolf realRoster", () => {
  it("has one managed-agent Agent per model", () => {
    const roster = realRoster();
    expect(roster.map((a) => a.model)).toEqual([
      "gemini-4-hydrogen",
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
    ]);
    expect(new Set(roster.map((a) => a.id)).size).toBe(4);
    for (const a of roster) expect(a.harness).toBe(MANAGED_AGENT_HARNESS_ID);
  });

  it("carries no instructions, so each seat gets the Ruleset default narrowed to its role", () => {
    // Narrowing of the default per role is proven in test/system/agent-instructions.test.ts.
    for (const a of realRoster()) expect(a.instructions).toBeUndefined();
  });

  it("is accepted by the League config route's validation", () => {
    expect(patchConfig(defaultLeagueConfig(), { n: 1, roster: realRoster() }).ok).toBe(true);
  });
});
