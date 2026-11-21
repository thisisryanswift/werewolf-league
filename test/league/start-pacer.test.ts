import { describe, expect, it } from "vitest";
import { backoffUntil, startBudget } from "../../src/core/start-pacer";

const pacing = { startsPerWindow: 4, startWindowMs: 30_000 };

describe("start pacer", () => {
  it("allows up to the per-window limit from empty", () => {
    expect(startBudget([], 1_000, pacing, 0)).toEqual({ allowed: 4, nextAt: null });
  });

  it("counts only starts inside the sliding window, and says when the next slot frees", () => {
    // Starts at 0, 1 s, 2 s and 3 s: the window is full until the first expires at 30 s.
    expect(startBudget([0, 1_000, 2_000, 3_000], 10_000, pacing, 0)).toEqual({ allowed: 0, nextAt: 30_000 });
    expect(startBudget([0, 1_000, 2_000, 3_000], 30_000, pacing, 0)).toEqual({ allowed: 1, nextAt: null });
    expect(startBudget([0, 1_000, 2_000, 3_000], 33_000, pacing, 0)).toEqual({ allowed: 4, nextAt: null });
  });

  it("waits for enough starts to expire after the limit is lowered", () => {
    // Six starts in the window and a limit of 4: three must expire before one more may start.
    expect(startBudget([0, 1, 2, 3, 4, 5], 10, pacing, 0)).toEqual({ allowed: 0, nextAt: 30_002 });
  });

  it("allows nothing during a backoff, and resumes when it ends", () => {
    expect(startBudget([], 1_000, pacing, 61_000)).toEqual({ allowed: 0, nextAt: 61_000 });
    expect(startBudget([], 61_000, pacing, 61_000)).toEqual({ allowed: 4, nextAt: null });
  });

  it("extends a backoff but never shortens it", () => {
    expect(backoffUntil(0, 1_000, 60_000)).toBe(61_000);
    expect(backoffUntil(61_000, 2_000, 60_000)).toBe(62_000);
    expect(backoffUntil(90_000, 2_000, 60_000)).toBe(90_000);
  });
});
