// Per-role win stats: once per Match per role an Agent held, won if a Player in that role won.
import { describe, expect, it } from "vitest";
import { addRoleStats, addSettlementRoles, applyMatch, rolesPlayed, type AgentRecord } from "../../src/core/ratings";
import type { PlayerRatingChange } from "../../src/shared/protocol";

const p = (seat: number, agentId: string, side: string, won: boolean): PlayerRatingChange => ({ seat, agentId, side, won, before: 1200, delta: 0 });

describe("role stats", () => {
  // a: two "x" seats on side A (won) and one "y" seat on side B (lost); b: one "z" seat on B.
  const players = [p(1, "a", "A", true), p(2, "a", "A", true), p(3, "a", "B", false), p(4, "b", "B", false)];
  const roles = { 1: "x", 2: "x", 3: "y", 4: "z" };

  it("counts each role once per Match, won only by the role's own Players", () => {
    expect(rolesPlayed(players, roles)).toEqual({ a: { x: true, y: false }, b: { z: false } });
  });

  it("applyMatch adds the Match to each Agent's role tallies", () => {
    const records: Record<string, AgentRecord> = {
      a: { name: "a", ratings: {}, matches: 3, wins: {}, timeouts: 0, roles: { x: { played: 2, won: 1 } } },
    };
    const out = applyMatch({ records, players, winner: "A", sideOrder: ["A", "B"], names: {}, timeoutsByAgent: {}, roles }).records;
    expect(out.a!.roles).toEqual({ x: { played: 3, won: 2 }, y: { played: 1, won: 0 } });
    expect(out.b!.roles).toEqual({ z: { played: 1, won: 0 } });
  });

  it("leaves role tallies alone for a result without roles", () => {
    const out = applyMatch({ records: {}, players, winner: "A", sideOrder: ["A", "B"], names: {}, timeoutsByAgent: {} }).records;
    expect(out.a!.roles).toBeUndefined();
  });

  it("addSettlementRoles counts a stored settlement, including older shapes without per-Player changes", () => {
    const rec = (): AgentRecord => ({ name: "x", ratings: {}, matches: 1, wins: {}, timeouts: 0 });
    const records = { a: rec(), b: rec() };
    // Older rated shape: seats plus the result's Sides and winner say who won.
    const old = { ratings: {}, seats: [{ seat: 1, agentId: "a" }, { seat: 2, agentId: "b" }, { seat: 3, agentId: "ghost" }], result: { winner: "A", sides: { 1: "A", 2: "B", 3: "A" } } };
    const out = addSettlementRoles(records, old, { 1: "x", 2: "y", 3: "x" });
    expect(out.a!.roles).toEqual({ x: { played: 1, won: 1 } });
    expect(out.b!.roles).toEqual({ y: { played: 1, won: 0 } });
    expect(out.ghost).toBeUndefined(); // no record, nothing invented
    // Unrated: nothing counted.
    expect(addSettlementRoles(records, { ...old, ratings: null }, { 1: "x" })).toBe(records);
  });

  it("addRoleStats adds one Match's roles to existing tallies", () => {
    expect(addRoleStats({ x: { played: 1, won: 1 } }, { x: false, y: true })).toEqual({ x: { played: 2, won: 1 }, y: { played: 1, won: 1 } });
  });
});
