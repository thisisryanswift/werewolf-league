import { describe, expect, it } from "vitest";
import { defaultLeagueConfig, patchConfig } from "../../src/core/roster";

describe("hiddenAgents config", () => {
  it("accepts a list of Agent ids and rejects anything else", () => {
    const ok = patchConfig(defaultLeagueConfig(), { hiddenAgents: ["a", "b"] });
    expect(ok.ok).toBe(true);
    expect(ok.ok && ok.config.hiddenAgents).toEqual(["a", "b"]);
    expect(patchConfig(defaultLeagueConfig(), { hiddenAgents: "a" }).ok).toBe(false);
    expect(patchConfig(defaultLeagueConfig(), { hiddenAgents: [""] }).ok).toBe(false);
  });
});

describe("uniqueAgents config", () => {
  it("accepts a boolean only", () => {
    const ok = patchConfig(defaultLeagueConfig(), { uniqueAgents: true });
    expect(ok.ok && ok.config.uniqueAgents).toBe(true);
    expect(patchConfig(defaultLeagueConfig(), { uniqueAgents: "yes" }).ok).toBe(false);
  });
});
