import { describe, expect, it } from "vitest";
import { matchLabel } from "../../src/shared/match-label";

describe("matchLabel", () => {
  it("names a numbered Match by its Match Number", () => {
    expect(matchLabel({ matchId: "492beb1a-0000-4000-8000-000000000000", matchNumber: 127 })).toBe("Match 127");
  });

  it("falls back to the short Match ID for a Match without a number", () => {
    expect(matchLabel({ matchId: "492beb1a-0000-4000-8000-000000000000" })).toBe("Match 492beb1a");
  });
});
