// Leaderboard columns: per-role win cells named by the Ruleset's roles, after the per-Side win cells.
import { describe, expect, it } from "vitest";
import { columns } from "../../web/leaderboard/columns";
import type { AgentStanding } from "../../src/shared/protocol";

const row: AgentStanding = {
  agentId: "a",
  name: "A",
  ratings: {},
  overall: 1200,
  matches: 9,
  wins: {},
  played: {},
  roles: { seer: { played: 9, won: 4 } },
  timeouts: 0,
  calibration: null,
};

describe("leaderboard role columns", () => {
  it("adds one wins cell per Ruleset role, in its order, after the Side wins", () => {
    const cols = columns(["s"], [
      { id: "seer", name: "Seer" },
      { id: "doctor", name: "Doctor" },
    ]);
    const keys = cols.map((c) => c.key);
    expect(keys.slice(keys.indexOf("wins:s"), keys.indexOf("wins:s") + 3)).toEqual(["wins:s", "role:seer", "role:doctor"]);
    const seer = cols.find((c) => c.key === "role:seer")!;
    expect(seer.label).toBe("Seer wins");
    expect(seer.render(row)).toBe("4/9 (44%)");
    expect(cols.find((c) => c.key === "role:doctor")!.render(row)).toBe("—");
  });

  it("has no role columns for a Ruleset without roles", () => {
    expect(columns(["s"]).some((c) => c.key.startsWith("role:"))).toBe(false);
  });
});
