import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { actors, dealt, kill, toNightAction } from "./helpers";

/** A dealt table, past Night 1's Wolf Chat. */
const atAction = () => {
  const t = dealt();
  return { ...t, state: toNightAction(t.state) };
};

describe("Werewolf Night kill", () => {
  it("kills the wolves' target and reveals its role publicly, then starts Day 1", () => {
    const { state, wolves, villagers } = atAction();
    const target = villagers[0]!;
    const { state: next, events } = werewolf.applyActions(state, {
      [wolves[0]!]: kill(target),
      [wolves[1]!]: kill(target),
    });
    const death = events.find((e) => e.kind === "player_died")!;
    expect(death).toMatchObject({ audience: "all", data: { seat: target, role: "villager", cause: "night_kill" } });
    expect(events.find((e) => e.kind === "phase_started")?.data).toEqual({ phase: "day", cycle: 1 });
    expect(actors(next)).toEqual([...wolves, ...villagers].filter((s) => s !== target).sort((a, b) => a - b));
  });

  it("kills nobody when no wolf chooses (default)", () => {
    const { state, wolves } = atAction();
    const { events } = werewolf.applyActions(state, { [wolves[0]!]: null, [wolves[1]!]: null });
    expect(events.some((e) => e.kind === "player_died")).toBe(false);
    expect(events.find((e) => e.kind === "night_passed")?.data).toEqual({ cycle: 1, killed: null });
  });

  it("uses the lone proposal when only one wolf chooses", () => {
    const { state, wolves, villagers } = atAction();
    const { events } = werewolf.applyActions(state, { [wolves[0]!]: null, [wolves[1]!]: kill(villagers[2]!) });
    expect(events.find((e) => e.kind === "player_died")?.data.seat).toBe(villagers[2]);
  });

  it("shows the wolves' choices only to the wolves", () => {
    const { state, wolves, villagers } = atAction();
    const { events } = werewolf.applyActions(state, {
      [wolves[0]!]: kill(villagers[0]!),
      [wolves[1]!]: kill(villagers[0]!),
    });
    const choices = events.filter((e) => e.kind === "kill_chosen");
    expect(choices).toHaveLength(2);
    for (const c of choices) expect(c.audience).toEqual(wolves);
  });

  it("rejects an out-of-phase or illegal call with a message naming the required action", () => {
    const { state, wolves } = atAction();
    const wrongTool = werewolf.validate(state, wolves[0]!, { name: "vote", args: { target: 1 } });
    expect(wrongTool).toEqual({ ok: false, error: expect.stringContaining("choose_kill") });
    const wolfTarget = werewolf.validate(state, wolves[0]!, kill(wolves[1]!));
    expect(wolfTarget).toEqual({ ok: false, error: expect.stringContaining("choose_kill") });
    expect(werewolf.validate(state, wolves[0]!, kill(99)).ok).toBe(false);
    expect(werewolf.validate(state, wolves[0]!, kill(state.players.find((p) => p.role === "villager")!.seat)).ok).toBe(
      true,
    );
  });
});
