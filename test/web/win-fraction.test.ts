// Leaderboard cells: wins out of Matches played on a Side.
import { describe, expect, it } from "vitest";
import { formatWinFraction } from "../../web/leaderboard/win-fraction";

describe("formatWinFraction", () => {
  it("shows wins out of Matches played with a whole percentage", () => {
    expect(formatWinFraction(3, 12)).toBe("3/12 (25%)");
    expect(formatWinFraction(16, 20)).toBe("16/20 (80%)");
    expect(formatWinFraction(1, 3)).toBe("1/3 (33%)");
    expect(formatWinFraction(0, 5)).toBe("0/5 (0%)");
  });

  it("shows a dash before any Match on the Side", () => {
    expect(formatWinFraction(0, 0)).toBe("—");
  });
});
