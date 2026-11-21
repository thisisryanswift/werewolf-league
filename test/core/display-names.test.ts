import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import { fakeRoster } from "../../src/core/roster";
import { labelSeats } from "../../src/core/start-match";

const agent = (id: string, name: string): AgentConfig => ({ id, name, harness: "fake" });
const table = (n: number): AgentConfig[] =>
  Array.from({ length: n }, (_, i) => (i % 2 ? agent("h", "Hydrogen") : agent("f", "3.8 Flash")));

describe("Display Names", () => {
  it("the same seed gives the same Display Names", () => {
    const a = labelSeats(table(7), "seed-1").map((s) => s.displayName);
    const b = labelSeats(table(7), "seed-1").map((s) => s.displayName);
    expect(a).toEqual(b);
    expect(a.every((n) => /^[A-Z][a-z]+$/.test(n))).toBe(true);
  });

  it("different seeds give different assignments", () => {
    const seeds = Array.from({ length: 20 }, (_, i) => labelSeats(table(7), `s${i}`).map((s) => s.displayName).join(","));
    expect(new Set(seeds).size).toBeGreaterThan(15);
  });

  it("names are unique within a Match at 16 seats, over many seeds", () => {
    for (let i = 0; i < 200; i++) {
      const names = labelSeats(table(16), `seed-${i}`).map((s) => s.displayName);
      expect(new Set(names).size).toBe(16);
    }
  });

  it("keeps the Agent's copy label beside the Display Name", () => {
    const seats = labelSeats([agent("h", "Hydrogen"), agent("h", "Hydrogen"), agent("f", "3.8 Flash")], "x");
    expect(seats.map((s) => s.label)).toEqual(["Hydrogen #1", "Hydrogen #2", "3.8 Flash"]);
  });

  it("never gives a seat a Display Name matching a participating Agent's name or id, in any case", () => {
    const named = [agent("mara", "Mara"), agent("TOBIN-bot", "Assistant"), ...table(14)];
    for (let i = 0; i < 200; i++) {
      const names = labelSeats(named, `p${i}`).map((s) => s.displayName.toLowerCase());
      expect(names).not.toContain("mara");
      expect(names).not.toContain("tobin");
      expect(new Set(names).size).toBe(16);
    }
    // Still deterministic.
    expect(labelSeats(named, "p1")).toEqual(labelSeats(named, "p1"));
  });

  it("never gives a Display Name equal to a default roster Agent name", () => {
    const roster = new Set(fakeRoster().map((a) => a.name));
    for (let i = 0; i < 50; i++) {
      for (const s of labelSeats(table(16), `r${i}`)) expect(roster.has(s.displayName)).toBe(false);
    }
  });
});
