import { describe, expect, it } from "vitest";
import { drawTable } from "../../src/core/draw";
import type { AgentConfig } from "../../src/core/harness";

const agent = (id: string): AgentConfig => ({ id, name: id.toUpperCase(), harness: "fake" });
const ok = () => null;

describe("drawTable with uniqueAgents", () => {
  it("seats each Agent at most once when the roster covers the table", () => {
    const roster = ["a", "b", "c", "d", "e", "f", "g"].map(agent);
    for (let i = 0; i < 50; i++) {
      const d = drawTable({ roster, seats: 7, seed: `s${i}`, check: ok, uniqueAgents: true });
      if (!d.ok) throw new Error(d.error);
      expect(new Set(d.agents.map((a) => a.id)).size).toBe(7);
    }
  });

  it("uses distinct Agents first, then copies, when the table is bigger than the roster", () => {
    const roster = ["a", "b", "c"].map(agent);
    const d = drawTable({ roster, seats: 7, seed: "x", check: ok, uniqueAgents: true });
    if (!d.ok) throw new Error(d.error);
    expect(new Set(d.agents.map((a) => a.id)).size).toBe(3);
    expect(d.agents).toHaveLength(7);
  });

  it("is deterministic for the same seed", () => {
    const roster = ["a", "b", "c", "d", "e", "f", "g", "h"].map(agent);
    const one = drawTable({ roster, seats: 7, seed: "same", check: ok, uniqueAgents: true });
    const two = drawTable({ roster, seats: 7, seed: "same", check: ok, uniqueAgents: true });
    expect(one.ok && one.agents.map((a) => a.id)).toEqual(two.ok && two.agents.map((a) => a.id));
  });
});

import { leagueDoName, leagueIdOf } from "../../src/core/leagues";
describe("pi-open reset", () => {
  it("maps the pi-open League to its fresh DO and back", () => {
    expect(leagueDoName("pi-open")).toBe("pi-open-2");
    expect(leagueIdOf("pi-open-2")).toBe("pi-open");
    expect(leagueDoName("gemini-managed")).toBe("default");
  });
});
