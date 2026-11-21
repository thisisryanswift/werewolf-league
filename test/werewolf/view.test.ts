import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { act, actors, day1Vote, nightKill, seatsOf, vote } from "./helpers";

/** Seat n's Display Name in seatsOf(). */
const nameOf = (seat: number) => `Name${seat}`;

function table() {
  const r = werewolf.setup({}, "view", seatsOf(7));
  if (!r.ok) throw new Error(r.error);
  const wolves = r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
  const villager = [1, 2, 3, 4, 5, 6, 7].find((s) => !wolves.includes(s))!;
  return { ...r, wolves, villager };
}

describe("Werewolf view and observations", () => {
  it("hides other roles and the wolf team from villagers, but not from Narrator's View", () => {
    const { events, wolves, villager } = table();
    const seen = werewolf.view(events, { seat: villager }).map((e) => e.kind);
    expect(seen.filter((k) => k === "role_assigned")).toHaveLength(1);
    expect(seen).not.toContain("wolf_team");
    expect(werewolf.view(events, { seat: wolves[0]! }).map((e) => e.kind)).toContain("wolf_team");
    expect(werewolf.view(events, { spectator: true, narratorView: true })).toHaveLength(events.length);
    expect(werewolf.view(events, { spectator: true, narratorView: false }).map((e) => e.kind)).not.toContain("role_assigned");
  });

  it("briefs a Werewolf with rules, role, seats and partner", () => {
    const { state, wolves } = table();
    const text = werewolf.briefing(state, wolves[0]!);
    expect(text).toMatch(/Werewolf/);
    expect(text).toContain(`You are ${nameOf(wolves[0]!)} (seat ${wolves[0]})`);
    expect(text).toContain(`partner is ${nameOf(wolves[1]!)} (seat ${wolves[1]})`);
    expect(text).toContain(`- Seat 7: ${nameOf(7)}`);
  });

  it("never shows a Player another seat's Agent or copy label", () => {
    const { state, wolves } = table();
    for (const p of state.players) {
      const text = werewolf.briefing(state, p.seat);
      expect(text).not.toMatch(/Agent \d/);
      expect(text).not.toContain("agent-");
    }
    // Wolf Chat names the speaker by Display Name.
    const chat = act(state, () => ({ name: "wolf_chat", args: { text: "hi" } }));
    const seat = wolves[1]!;
    const obs = werewolf.renderObservation(chat.state, seat, werewolf.view(chat.events, { seat }), {
      seat,
      actionKind: "wolf_chat",
      legalTargets: [],
      prompt: "go",
    });
    expect(obs).toContain(`${nameOf(wolves[0]!)} (seat ${wolves[0]}): hi`);
    expect(obs).not.toMatch(/Agent \d/);
  });

  it("reveals votes and deaths by Display Name", () => {
    const { state } = day1Vote("view");
    const r = werewolf.applyActions(state, Object.fromEntries(actors(state).map((s) => [s, vote(s === 1 ? 2 : 1)])));
    const seat = 3;
    const turn = { seat, actionKind: "x", legalTargets: [], prompt: "go" };
    const text = werewolf.renderObservation(r.state, seat, werewolf.view(r.events, { seat }), turn);
    expect(text).toContain(`${nameOf(1)} (seat 1) → ${nameOf(2)} (seat 2)`);
    expect(text).toContain(`${nameOf(2)} (seat 2) → ${nameOf(1)} (seat 1)`);
    expect(text).toContain(`${nameOf(1)} (seat 1) was eliminated by vote`);
    expect(text).not.toMatch(/Agent \d/);
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
    expect(text).toContain(`${nameOf(villager)} (seat ${villager}) was killed in the Night`);
    expect(text).toContain(me.prompt);
  });
});
