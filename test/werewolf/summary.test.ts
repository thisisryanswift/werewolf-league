import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { act, dealt, nightKill, speak, turnsOf } from "./helpers";

describe("Werewolf tile summary", () => {
  it("starts at Night 1 with every seat alive and no speech", () => {
    const { state } = dealt("summary");
    const { wolves } = dealt("summary");
    const s = werewolf.summary(state, []);
    expect(s).toMatchObject({
      phase: "Night",
      round: 1,
      // The public step tag never says whether Wolf Chat is running (that would count living Werewolves).
      step: "Night actions",
      alive: [1, 2, 3, 4, 5, 6, 7],
      latestSpeech: null,
    });
    expect(s.narratorView?.step).toBe("Wolf Chat");
    expect(Object.keys(s.narratorView!.roles).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const w of wolves) expect(s.narratorView!.roles[w]).toBe("werewolf");
  });

  it("tags each Day step: Speech Rounds by letter, Right of Reply, and the vote", () => {
    let { state } = dealt("summary-steps");
    const tags: string[] = [];
    const seen = () => {
      const t = werewolf.summary(state, []).step!;
      if (tags.at(-1) !== t) tags.push(t);
    };
    seen();
    while (state.phase !== "over" && !(state.phase === "night" && state.cycle === 2)) {
      state = act(state, (seat) => {
        const t = turnsOf(state).find((x) => x.seat === seat)!;
        return t.actionKind === "speak" ? speak("hi") : null;
      }).state;
      seen();
    }
    expect(tags.slice(0, 3)).toEqual(["Night actions", "Speech Round A", "Speech Round B"]);
    expect(tags).toContain("Vote");
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

  it("names the winning Side once the Match is over, and not before", () => {
    const { state } = dealt("summary");
    expect(werewolf.summary(state, []).result).toBeUndefined();
    expect(werewolf.summary({ ...state, phase: "over", winner: "wolf" }, []).result).toBe("Werewolves");
    expect(werewolf.summary({ ...state, phase: "over", winner: "village" }, []).result).toBe("Village");
  });
});
