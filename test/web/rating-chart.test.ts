import { describe, expect, it } from "vitest";
import type { RatingsHistory } from "../../src/core/ratings-history";
import { metricValues, niceTicks, ratingDomain, sharedDomain, spreadLabels } from "../../web/leaderboard/chart-model";

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

  const history: RatingsHistory = {
    agents: [{ agentId: "a", name: "Alpha" }],
    points: [
      { matchNumber: 1, settledAt: 1, overall: { a: 1210 }, sides: { wolf: { a: 1260 }, village: { a: 1160 } } },
      { matchNumber: 2, settledAt: 2, overall: { a: 1215 }, sides: { wolf: { a: 1270 }, village: { a: 1160 } } },
    ],
  };

  it("reads Overall or one Side per point, empty for a payload without Side ratings", () => {
    expect(metricValues(history.points[1]!, "overall")).toEqual({ a: 1215 });
    expect(metricValues(history.points[1]!, "wolf")).toEqual({ a: 1270 });
    const old = { matchNumber: 1, settledAt: 1, overall: { a: 1200 } } as unknown as RatingsHistory["points"][number];
    expect(metricValues(old, "village")).toEqual({});
  });

  it("shares one y-domain across the stacked metrics", () => {
    expect(sharedDomain(history, ["overall", "village", "wolf"])).toEqual(ratingDomain([1210, 1160, 1260, 1215, 1160, 1270]));
  });
});
