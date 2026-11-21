import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { actors, dealt, nightKill, vote, voteAll } from "./helpers";

/** Past Night 1 with nobody killed: everyone is alive on Day 1. */
function day1() {
  const t = dealt();
  return { ...t, state: nightKill(t.state, null).state };
}

describe("Werewolf Day vote (minimal)", () => {
  it("eliminates the plurality target, reveals its role and starts the next Night", () => {
    const { state, wolves, villagers } = day1();
    const [a, b, c, d] = villagers;
    const { state: next, events } = voteAll(state, { [a!]: wolves[0]!, [b!]: wolves[0]!, [c!]: wolves[0]!, [d!]: a! });
    expect(events.find((e) => e.kind === "player_died")).toMatchObject({
      audience: "all",
      data: { seat: wolves[0], role: "werewolf", cause: "vote", cycle: 1 },
    });
    expect(events.find((e) => e.kind === "phase_started")?.data).toEqual({ phase: "night", cycle: 2 });
    expect(actors(next)).toEqual([wolves[1]]);
  });

  it("publishes every ballot, with timeouts shown as Abstain", () => {
    const { state, wolves, villagers } = day1();
    const actions = Object.fromEntries(actors(state).map((s) => [s, s === villagers[0] ? null : vote(wolves[0]!)]));
    const { events } = werewolf.applyActions(state, actions);
    const votes = events.find((e) => e.kind === "votes_revealed")!.data.votes as { seat: number; target: unknown }[];
    expect(votes).toHaveLength(7);
    expect(votes.find((v) => v.seat === villagers[0])).toMatchObject({ target: "abstain", timedOut: true });
  });

  it("eliminates nobody on a tie", () => {
    const { state, wolves, villagers } = day1();
    const [a, b] = villagers;
    const { events } = voteAll(state, { [a!]: wolves[0]!, [b!]: wolves[1]! });
    expect(events.some((e) => e.kind === "player_died")).toBe(false);
    expect(events.find((e) => e.kind === "no_elimination")?.data).toEqual({ cycle: 1, reason: "tie" });
  });

  it("eliminates nobody when everyone abstains", () => {
    const { state } = day1();
    const { events } = voteAll(state, {});
    expect(events.find((e) => e.kind === "no_elimination")?.data).toEqual({ cycle: 1, reason: "all_abstain" });
  });

  it("only allows living players other than yourself, or abstain", () => {
    const { state, villagers } = day1();
    const me = villagers[0]!;
    expect(werewolf.validate(state, me, vote(me))).toEqual({ ok: false, error: expect.stringContaining("vote") });
    expect(werewolf.validate(state, me, vote("abstain")).ok).toBe(true);
    expect(werewolf.validate(state, me, vote(villagers[1]!)).ok).toBe(true);
    expect(werewolf.validate(state, me, { name: "choose_kill", args: { target: 1 } })).toEqual({
      ok: false,
      error: expect.stringContaining("Required action: vote"),
    });
  });
});
