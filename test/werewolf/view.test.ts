import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { nightKill, seatsOf } from "./helpers";

function table() {
  const r = werewolf.setup({}, "view", seatsOf(7));
  if (!r.ok) throw new Error(r.error);
  const wolves = r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
  const villager = [1, 2, 3, 4, 5, 6, 7].find((s) => !wolves.includes(s))!;
  return { ...r, wolves, villager };
}

describe("Werewolf view and observations", () => {
  it("hides other roles and the wolf team from villagers, but not from God View", () => {
    const { events, wolves, villager } = table();
    const seen = werewolf.view(events, { seat: villager }).map((e) => e.kind);
    expect(seen.filter((k) => k === "role_assigned")).toHaveLength(1);
    expect(seen).not.toContain("wolf_team");
    expect(werewolf.view(events, { seat: wolves[0]! }).map((e) => e.kind)).toContain("wolf_team");
    expect(werewolf.view(events, { spectator: true, godView: true })).toHaveLength(events.length);
    expect(werewolf.view(events, { spectator: true, godView: false }).map((e) => e.kind)).not.toContain("role_assigned");
  });

  it("briefs a Werewolf with rules, role, seats and partner", () => {
    const { state, wolves } = table();
    const text = werewolf.briefing(state, wolves[0]!);
    expect(text).toMatch(/Werewolf/);
    expect(text).toContain(`You are seat ${wolves[0]}`);
    expect(text).toContain(`partner is seat ${wolves[1]}`);
    expect(text).toContain("Agent 7");
  });

  it("briefs the Seer and Doctor with their role and the Night rules", () => {
    const { state } = table();
    const seat = (role: string) => state.players.find((p) => p.role === role)!.seat;
    expect(werewolf.briefing(state, seat("seer"))).toContain("Your secret role: Seer");
    const doctor = werewolf.briefing(state, seat("doctor"));
    expect(doctor).toContain("Your secret role: Doctor");
    expect(doctor).toMatch(/same player on consecutive Nights/);
    expect(doctor).toMatch(/Wolf Chat/);
    expect(doctor).toMatch(/Pack Leader/);
  });

  it("renders new events and the required action into the observation", () => {
    const { state: s0, villager } = table();
    const { state: s2, events } = nightKill(s0, villager);
    const next = werewolf.nextStep(s2);
    if (next.type !== "turns") throw new Error();
    const me = next.turns[0]!;
    const text = werewolf.renderObservation(s2, me.seat, werewolf.view(events, { seat: me.seat }), me);
    expect(text).toContain(`Seat ${villager}`);
    expect(text).toContain("was killed in the Night");
    expect(text).toContain(me.prompt);
  });
});
