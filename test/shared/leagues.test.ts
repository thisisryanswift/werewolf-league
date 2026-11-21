import { describe, expect, it } from "vitest";
import { leagueIdFromSearch, searchForLeague } from "../../src/shared/leagues";

describe("the League in the grid URL", () => {
  it("is ?league=<id>, defaulting to gemini-managed", () => {
    expect(leagueIdFromSearch("")).toBe("gemini-managed");
    expect(leagueIdFromSearch("?league=pi-open")).toBe("pi-open");
    expect(leagueIdFromSearch("?league=gemini-managed")).toBe("gemini-managed");
    // An unknown League falls back to the default rather than an empty grid.
    expect(leagueIdFromSearch("?league=nope")).toBe("gemini-managed");
  });

  it("switching League sets ?league= and keeps other parameters", () => {
    expect(searchForLeague("", "pi-open")).toBe("?league=pi-open");
    expect(searchForLeague("?league=pi-open&x=1", "gemini-managed")).toBe("?league=gemini-managed&x=1");
  });
});
