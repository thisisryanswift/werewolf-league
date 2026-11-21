import { describe, expect, it } from "vitest";
import instructionsFile from "../../docs/agent-instructions/werewolf.md?raw";
import { agentInstructions, realRoster } from "../../src/rulesets/werewolf/roster";
import { defaultLeagueConfig, patchConfig } from "../../src/core/roster";
import { MANAGED_AGENT_HARNESS_ID } from "../../src/harness/managed-agent";

describe("Werewolf realRoster", () => {
  it("has one managed-agent Agent per model, sharing the instructions", () => {
    const roster = realRoster(instructionsFile);
    expect(roster.map((a) => a.model)).toEqual([
      "gemini-4-hydrogen",
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-3.5-flash-lite",
    ]);
    expect(new Set(roster.map((a) => a.id)).size).toBe(4);
    for (const a of roster) {
      expect(a.harness).toBe(MANAGED_AGENT_HARNESS_ID);
      expect(a.instructions).toBe(agentInstructions(instructionsFile));
    }
  });

  it("drops the human-only text above the first section marker, keeping every section", () => {
    const text = agentInstructions(instructionsFile);
    expect(text.startsWith("<!-- section: shared -->")).toBe(true);
    expect(text).not.toContain("## Wiring (for the harness");
    for (const s of ["shared", "village", "seer", "doctor", "werewolf"]) expect(text).toContain(`<!-- section: ${s} -->`);
  });

  it("refuses instructions without a section marker", () => {
    expect(() => realRoster("# no markers here")).toThrow(/marker/);
  });

  it("is accepted by the League config route's validation", () => {
    const r = patchConfig(defaultLeagueConfig(), { n: 1, roster: realRoster(instructionsFile) });
    expect(r.ok).toBe(true);
  });
});
