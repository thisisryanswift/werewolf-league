import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { seatsOf } from "./helpers";

function setupOk(seed: string, n = 7) {
  const r = werewolf.setup({}, seed, seatsOf(n));
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("Werewolf deal", () => {
  it("deals two Werewolves and Villagers for the rest, the same way for the same seed", () => {
    const a = setupOk("seed-1");
    const b = setupOk("seed-1");
    expect(werewolf.result(a.state)).toBeNull();
    const wolves = (r: typeof a) =>
      r.events.filter((e) => e.kind === "role_assigned" && e.data.role === "werewolf").map((e) => e.data.seat);
    expect(wolves(a)).toHaveLength(2);
    expect(wolves(a)).toEqual(wolves(b));
    const roles = a.events.filter((e) => e.kind === "role_assigned").map((e) => e.data.role);
    expect(roles.filter((r) => r === "villager")).toHaveLength(5);
  });

  it("gives every seat speak and vote, and Werewolves choose_kill too", () => {
    const r = setupOk("seed-2");
    const wolfSeats = r.events
      .filter((e) => e.kind === "role_assigned" && e.data.role === "werewolf")
      .map((e) => e.data.seat as number);
    for (let seat = 1; seat <= 7; seat++) {
      const names = r.tools[seat]!.map((t) => t.name).sort();
      expect(names).toEqual(wolfSeats.includes(seat) ? ["choose_kill", "speak", "vote"] : ["speak", "vote"]);
    }
  });

  it("tells each Player its role privately and wolves their partner", () => {
    const r = setupOk("seed-3");
    for (const e of r.events.filter((e) => e.kind === "role_assigned")) {
      expect(e.audience).toEqual([e.data.seat]);
    }
    const team = r.events.find((e) => e.kind === "wolf_team")!;
    expect(team.audience).toEqual(team.data.wolves);
  });

  it("starts with Night 1", () => {
    const r = setupOk("seed-4");
    const step = werewolf.nextStep(r.state);
    expect(step.type).toBe("turns");
    if (step.type !== "turns") return;
    expect(step.turns.map((t) => t.actionKind)).toEqual(["choose_kill", "choose_kill"]);
  });
});
