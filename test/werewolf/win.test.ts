import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import type { WerewolfState } from "../../src/rulesets/werewolf/types";
import { actors, dealt, nightKill, voteAll } from "./helpers";

/** Day vote where every voter targets `target`. */
function lynch(state: WerewolfState, target: number) {
  return voteAll(state, Object.fromEntries(actors(state).filter((s) => s !== target).map((s) => [s, target])));
}

describe("Werewolf win conditions", () => {
  it("Village wins when every Werewolf is dead, with all roles revealed", () => {
    const { state: s0, wolves } = dealt();
    let s = nightKill(s0, null).state;
    s = lynch(s, wolves[0]!).state;
    s = nightKill(s, null).state;
    const { state, events } = lynch(s, wolves[1]!);
    const over = events.find((e) => e.kind === "match_over")!;
    expect(over.audience).toBe("all");
    expect(over.data).toMatchObject({ winner: "village", reason: "all_werewolves_dead" });
    expect(Object.keys(over.data.roles as object)).toHaveLength(7);
    expect(events.some((e) => e.kind === "phase_started")).toBe(false);
    const result = werewolf.result(state)!;
    expect(result.winner).toBe("village");
    expect(result.sides[wolves[0]!]).toBe("wolf");
    expect(werewolf.nextStep(state)).toEqual({ type: "finished", result });
  });

  it("Werewolves win at parity", () => {
    // 7 seats: 2 wolves, 5 villagers. Kill 3 villagers -> 2 v 2.
    const { state: s0, villagers } = dealt();
    let s = nightKill(s0, villagers[0]!).state;
    s = lynch(s, villagers[1]!).state;
    const { state, events } = nightKill(s, villagers[2]!);
    expect(events.find((e) => e.kind === "match_over")?.data).toMatchObject({ winner: "wolf", reason: "parity" });
    expect(werewolf.result(state)?.winner).toBe("wolf");
  });

  it("Werewolves win after the 6th Day/Night cycle if any survive", () => {
    let { state } = dealt();
    for (let cycle = 1; cycle <= 6; cycle++) {
      expect(werewolf.result(state)).toBeNull();
      state = nightKill(state, null).state;
      const r = voteAll(state, {});
      state = r.state;
      if (cycle === 6) {
        expect(r.events.find((e) => e.kind === "match_over")?.data).toMatchObject({ winner: "wolf", reason: "cycle_cap" });
      }
    }
    expect(werewolf.result(state)?.winner).toBe("wolf");
  });

  it("checks the cap configurably", () => {
    const r = werewolf.setup({ maxCycles: 1 }, "x", dealt().state.players);
    if (!r.ok) throw new Error();
    const s = nightKill(r.state, null).state;
    expect(werewolf.result(voteAll(s, {}).state)?.winner).toBe("wolf");
  });
});
