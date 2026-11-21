import { describe, expect, it } from "vitest";
import { acquireSlot, REPORT_TOOL, validateReport } from "../../src/core/analyst";

const seats = [1, 2, 3, 4, 5, 6, 7];

const report = (over: Record<string, unknown> = {}) => ({
  summary: "The Werewolves won at parity on Day 3. The village never found them.",
  turning_points: [
    { when: "Night 1", what: "The Seer was killed." },
    { when: "Day 2 vote", what: "The village eliminated its own Doctor." },
  ],
  mistakes: [{ seat: 3, agent: "Hydrogen #1", what: "Voted out a Player it had found village.", evidence: "Day 2 vote: 'Kai is lying'." }],
  best_play: { seat: 5, why: "A fake Seer Claim that fit every death." },
  why_winner_won: "The village's mistakes.",
  ...over,
});

describe("League Analyst slots", () => {
  it("grants up to the cap, renews a holder's lease, and frees expired leases", () => {
    let s = acquireSlot({}, "a", 0, 2, 100).slots;
    s = acquireSlot(s, "b", 0, 2, 100).slots;
    expect(acquireSlot(s, "c", 50, 2, 100).granted).toBe(false);
    // A holder re-acquiring extends its lease past the original expiry.
    s = acquireSlot(s, "a", 90, 2, 100).slots;
    expect(s.a).toBe(190);
    // b's lease (100) has lapsed at 150, so c gets its slot; a's renewed lease still holds.
    const r = acquireSlot(s, "c", 150, 2, 100);
    expect(r.granted).toBe(true);
    expect(Object.keys(r.slots).sort()).toEqual(["a", "c"]);
  });
});

describe("the Analyst's submit_report", () => {
  it("accepts a well-formed report", () => {
    expect(validateReport({ name: "submit_report", args: report() }, seats)).toEqual({ ok: true });
    expect(validateReport({ name: "submit_report", args: report({ mistakes: [] }) }, seats)).toEqual({ ok: true });
  });

  it("rejects other tools, missing fields and unknown seats, naming the problem", () => {
    expect(validateReport({ name: "vote", args: {} }, seats)).toMatchObject({ ok: false, error: expect.stringContaining("submit_report") });
    expect(validateReport({ name: "submit_report", args: report({ summary: 7 }) }, seats)).toMatchObject({
      ok: false,
      error: expect.stringContaining("summary"),
    });
    expect(validateReport({ name: "submit_report", args: report({ best_play: { seat: 9, why: "x" } }) }, seats)).toMatchObject({
      ok: false,
      error: expect.stringContaining("seat 9"),
    });
  });

  it("enforces the field limits: 2-4 turning points, at most 5 mistakes, at most 2 per Player", () => {
    const tp = { when: "Day 1", what: "x" };
    const m = (seat: number) => ({ seat, agent: "A", what: "x", evidence: "y" });
    const ok = (args: Record<string, unknown>) => validateReport({ name: "submit_report", args: report(args) }, seats).ok;
    expect(ok({ turning_points: [tp] })).toBe(false);
    expect(ok({ turning_points: [tp, tp, tp, tp, tp] })).toBe(false);
    expect(ok({ turning_points: [tp, tp, tp, tp] })).toBe(true);
    expect(ok({ mistakes: [m(1), m(2), m(3), m(4), m(5), m(6)] })).toBe(false);
    expect(ok({ mistakes: [m(1), m(1), m(1)] })).toBe(false);
    expect(ok({ mistakes: [m(1), m(1), m(2), m(3), m(4)] })).toBe(true);
  });

  it("puts the same limits in the tool schema", () => {
    const p = REPORT_TOOL.parameters as { properties: Record<string, { minItems?: number; maxItems?: number }>; required: string[] };
    expect(REPORT_TOOL.name).toBe("submit_report");
    expect(p.required).toEqual(["summary", "turning_points", "mistakes", "best_play", "why_winner_won"]);
    expect(p.properties.turning_points).toMatchObject({ minItems: 2, maxItems: 4 });
    expect(p.properties.mistakes).toMatchObject({ maxItems: 5 });
  });
});
