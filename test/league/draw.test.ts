import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import { drawTable } from "../../src/core/draw";
import type { SeatAgent } from "../../src/core/ruleset";

const agent = (id: string): AgentConfig => ({ id, name: id, harness: "fake" });
const roster = ["a", "b", "c"].map(agent);
const acceptAll = () => null;
const ids = (agents: AgentConfig[]) => agents.map((a) => a.id);

describe("drawTable", () => {
  it("fills every seat from the roster and always has at least 2 distinct Agents", () => {
    for (let i = 0; i < 200; i++) {
      const r = drawTable({ roster: [agent("x"), agent("y")], seats: 7, seed: `s${i}`, check: acceptAll });
      if (!r.ok) throw new Error(r.error);
      expect(r.agents).toHaveLength(7);
      expect(new Set(ids(r.agents)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives the same table for the same seed", () => {
    const a = drawTable({ roster, seats: 7, seed: "same", check: acceptAll });
    const b = drawTable({ roster, seats: 7, seed: "same", check: acceptAll });
    expect(a).toEqual(b);
    const c = drawTable({ roster, seats: 7, seed: "other", check: acceptAll });
    expect(c.ok && a.ok && ids(c.agents)).not.toEqual(a.ok && ids(a.agents));
  });

  it("refuses a roster of fewer than 2 Agents", () => {
    for (const r of [[], [agent("solo")], [agent("solo"), agent("solo")]]) {
      const res = drawTable({ roster: r, seats: 7, seed: "s", check: acceptAll });
      expect(res).toMatchObject({ ok: false });
      expect(!res.ok && res.error).toMatch(/at least 2 Agents/);
    }
  });

  it("redraws deterministically when the deal is rejected", () => {
    // Reject any table whose seat 1 is Agent "a": a stand-in for a Ruleset setup error.
    const seen: SeatAgent[][] = [];
    const check = (seats: SeatAgent[]) => {
      seen.push(seats);
      return seats[0]!.agentId === "a" ? "seat 1 may not be a" : null;
    };
    // Find a seed whose first draw is rejected.
    let seed = "";
    for (let i = 0; ; i++) {
      seen.length = 0;
      const r = drawTable({ roster, seats: 7, seed: `redraw-${i}`, check });
      if (r.ok && r.attempt > 0) {
        seed = `redraw-${i}`;
        break;
      }
    }
    seen.length = 0;
    const first = drawTable({ roster, seats: 7, seed, check });
    const firstSeen = seen.map((s) => s.map((x) => x.agentId));
    seen.length = 0;
    const again = drawTable({ roster, seats: 7, seed, check });
    expect(first.ok).toBe(true);
    expect(again).toEqual(first);
    expect(seen.map((s) => s.map((x) => x.agentId))).toEqual(firstSeen);
    if (!first.ok) return;
    expect(first.attempt).toBe(firstSeen.length - 1);
    expect(first.agents[0]!.id).not.toBe("a");
  });

  it("gives up with the Ruleset's error after a bounded number of rejected draws", () => {
    const r = drawTable({ roster, seats: 7, seed: "never", check: () => "never ok" });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain("never ok");
  });
});
