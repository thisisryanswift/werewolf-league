import { describe, expect, it } from "vitest";
import { niceTicks, ratingDomain, spreadLabels } from "../../web/leaderboard/chart-model";

describe("rating chart model", () => {
  it("picks round ticks", () => {
    expect(niceTicks(1150, 1260, 6)).toEqual([1160, 1180, 1200, 1220, 1240, 1260]);
    expect(niceTicks(1, 9, 4)).toEqual([2, 4, 6, 8]);
  });

  it("always includes the 1200 baseline in the domain", () => {
    const [lo, hi] = ratingDomain([1250, 1300]);
    expect(lo).toBeLessThan(1200);
    expect(hi).toBeGreaterThan(1300);
  });

  it("pushes overlapping end labels apart, keeping order and bounds", () => {
    expect(spreadLabels([100, 102, 300], 20, 0, 400)).toEqual([100, 120, 300]);
    expect(spreadLabels([395, 398], 20, 0, 400)).toEqual([380, 400]);
  });
});
