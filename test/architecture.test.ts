import { describe, expect, it } from "vitest";

// Source text of the ruleset-agnostic modules, bundled at build time.
const sources = import.meta.glob(["../src/do/**/*.ts", "../src/core/**/*.ts", "../src/harness/**/*.ts", "../src/worker/**/*.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("architecture", () => {
  it("League, Match, Player, Harness and Worker code depends only on the Ruleset interface and names no roles", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/rulesets\/werewolf/);
      expect(text, file).not.toMatch(/\b(werewolf|werewolves|villager|village|seer|doctor|choose_kill)\b/i);
    }
  });
});
