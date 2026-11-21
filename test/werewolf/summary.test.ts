import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { dealt, nightKill } from "./helpers";

describe("Werewolf tile summary", () => {
  it("starts at Night 1 with every seat alive and no speech", () => {
    const { state } = dealt("summary");
    expect(werewolf.summary(state, [])).toEqual({
      phase: "Night",
      round: 1,
      alive: [1, 2, 3, 4, 5, 6, 7],
      latestSpeech: null,
    });
  });

  it("moves to Day 1 without the Night victim after the kill", () => {
    const { state, villagers, doctor } = dealt("summary");
    const victim = villagers.find((v) => v !== doctor)!;
    const r = nightKill(state, victim);
    const s = werewolf.summary(r.state, []);
    expect(s).toMatchObject({ phase: "Day", round: 1 });
    expect(s.alive).not.toContain(victim);
    expect(s.alive).toHaveLength(6);
  });

  it("shows the latest public speech line and ignores private events", () => {
    const { state } = dealt("summary");
    const events = [
      { kind: "speech", audience: "all" as const, data: { seat: 2, text: "first" } },
      { kind: "speech", audience: "all" as const, data: { seat: 5, text: "I trust seat 3." } },
      { kind: "speech", audience: [1, 4], data: { seat: 1, text: "secret" } },
    ];
    expect(werewolf.summary(state, events).latestSpeech).toEqual({ seat: 5, text: "I trust seat 3." });
  });
});
