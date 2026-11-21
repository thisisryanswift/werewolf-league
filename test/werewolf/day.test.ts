import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import type { ToolCall } from "../../src/core/ruleset";
import type { WerewolfState } from "../../src/rulesets/werewolf/types";
import type { RulesetEvent } from "../../src/shared/protocol";
import { act, actionOf, actors, day1, day1Vote, nightKill, seatsOf, speak, speakUntilVote, turnsOf, vote, voteAll } from "./helpers";

const speeches = (events: RulesetEvent[]) => events.filter((e) => e.kind === "speech").map((e) => e.data);
const kinds = (events: RulesetEvent[]) => events.map((e) => e.kind);

/** Speech Round A then B with the given per-round speeches (default: skipped). */
function roundsAB(
  state: WerewolfState,
  a: (seat: number) => ToolCall | null = () => null,
  b: (seat: number) => ToolCall | null = () => null,
) {
  const ra = act(state, a);
  const rb = act(ra.state, b);
  return { state: rb.state, events: [...ra.events, ...rb.events] };
}

const accuse = (...seats: number[]) => speak("I accuse", { accuse: seats });

describe("Werewolf Day: Speech Rounds", () => {
  it("opens the Day with Speech Round A for every living player", () => {
    const { state } = day1();
    expect(actionOf(state)).toBe("speak");
    expect([...actors(state)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(turnsOf(state)[0]!.prompt).toMatch(/Speech Round A/);
    expect(werewolf.validate(state, 1, vote(2))).toEqual({
      ok: false,
      error: expect.stringContaining("Required action: speak"),
    });
    expect(werewolf.validate(state, 1, speak("hello")).ok).toBe(true);
  });

  it("rejects a speech without text, naming the required action", () => {
    const { state } = day1();
    expect(werewolf.validate(state, 1, { name: "speak", args: { accuse: [2] } })).toEqual({
      ok: false,
      error: expect.stringMatching(/text.*Required action: speak/),
    });
    expect(werewolf.validate(state, 1, speak("x", { claim: "seer" })).ok).toBe(false);
  });

  it("runs Round B after Round A, then (with no Accusations) goes straight to the vote", () => {
    const { state } = day1();
    const a = act(state, () => speak("round A"));
    expect(actionOf(a.state)).toBe("speak");
    expect(turnsOf(a.state)[0]!.prompt).toMatch(/Speech Round B/);
    const b = act(a.state, () => speak("round B"));
    expect(actionOf(b.state)).toBe("vote");
    expect(kinds(b.events)).toEqual([...Array(7).fill("speech"), "no_right_of_reply"]);
    expect(b.events.at(-1)!.data).toEqual({ cycle: 1 });
  });

  it("publishes each speech with its Accusations, defences and Claim, dropping self and unknown seats", () => {
    const { state } = day1();
    const { events } = act(state, (seat) =>
      seat === 1
        ? speak("I am the Seer", { accuse: [3, 3, 1, 99], defend: [2], claim: { role: "Seer", results: [{ seat: 3, side: "wolf" }] } })
        : null,
    );
    const all = speeches(events);
    expect(all.find((d) => d.seat === 1)).toEqual({
      cycle: 1,
      round: "A",
      seat: 1,
      skipped: false,
      text: "I am the Seer",
      accuse: [3],
      defend: [2],
      claim: { role: "seer", results: [{ seat: 3, side: "wolf" }] },
    });
    expect(all.find((d) => d.seat === 2)).toMatchObject({ skipped: true, text: null, accuse: [], claim: null });
    expect(events.every((e) => e.audience === "all")).toBe(true);
  });

  it("presents a round's speeches in seat order from a starting seat that rotates each Day, skipping the dead", () => {
    const order = (st: WerewolfState) => speeches(act(st, () => speak("hi")).events).map((d) => d.seat as number);
    // A seed where the seat after Day 1's starter is a villager, so the Night can kill it.
    const found = Array.from({ length: 20 }, (_, i) => day1(`rotate-${i}`)).find((t) => {
      const start = order(t.state)[0]!;
      return t.villagers.includes((start % 7) + 1);
    })!;
    const day1Order = order(found.state);
    const start = day1Order[0]!;
    // Seat order, wrapping around from the starting seat; the turns are offered in the same order.
    expect(day1Order).toEqual(Array.from({ length: 7 }, (_, i) => ((start - 1 + i) % 7) + 1));
    expect(actors(found.state)).toEqual(day1Order);

    // Day 2 would start at the next seat, but it was killed in the Night: the seat after it starts.
    const next = (start % 7) + 1;
    let s = voteAll(found.state, {}).state;
    s = nightKill(s, next).state;
    const day2Order = order(s);
    expect(day2Order[0]).toBe((next % 7) + 1);
    expect(day2Order).toHaveLength(6);
    expect(day2Order).not.toContain(next);

    // Each later Day starts at the next living seat after the previous Day's starter, so it always changes.
    const day2Start = day2Order[0]!;
    s = nightKill(voteAll(s, {}).state, null).state;
    expect(order(s)[0]).toBe((day2Start % 7) + 1);
  });

  it("shows Round B speakers the Round A speeches, with their Accusations and Claims", () => {
    const { state } = day1();
    const a = act(state, (seat) =>
      seat === 2
        ? speak("Seat 3 is lying", { accuse: [3], claim: { role: "seer", results: [{ seat: 3, side: "wolf" }] } })
        : null,
    );
    const turn = turnsOf(a.state).find((t) => t.seat === 5)!;
    const text = werewolf.renderObservation(a.state, 5, werewolf.view(a.events, { seat: 5 }), turn);
    expect(text).toContain('"Seat 3 is lying"');
    expect(text).toContain('Name2 (seat 2) [Round A]: "Seat 3 is lying"');
    expect(text).toContain("accuses Name3 (seat 3)");
    expect(text).toContain("claims to be seer (Name3 (seat 3) is wolf)");
    expect(text).toContain("Speech Round B");
  });

  it("removes abstain from the vote tool when voluntary Abstain is disabled", () => {
    const voteTool = (config: Record<string, unknown>) => {
      const r = werewolf.setup(config, "tools", seatsOf(7));
      if (!r.ok) throw new Error(r.error);
      return JSON.stringify(r.tools[1]!.find((t) => t.name === "vote"));
    };
    expect(voteTool({})).toContain("abstain");
    expect(voteTool({ allowAbstain: false })).not.toContain("abstain");
  });

  it("gives the same event log for the same seed and the same actions", () => {
    const play = () => {
      const { state } = day1("replay");
      const r = speakUntilVote(state, (seat, step) => speak(`s${seat}/${step}`, { accuse: [((seat + step) % 7) + 1] }));
      const v = voteAll(r.state, { 1: 2, 2: 3, 3: 2 });
      return [...r.events, ...v.events];
    };
    expect(play()).toEqual(play());
  });
});

describe("Werewolf Day: Right of Reply", () => {
  it("scores Accusations in Round A once and in Round B twice, and the top score replies", () => {
    const { state } = day1("reply", { replySlots: 1 });
    // Round A: seats 1, 2, 4 accuse seat 5 (3 points). Round B: seats 1, 2 accuse seat 6 (4 points).
    const r = roundsAB(
      state,
      (seat) => ([1, 2, 4].includes(seat) ? accuse(5) : null),
      (seat) => ([1, 2].includes(seat) ? accuse(6) : null),
    );
    expect(r.events.at(-1)).toEqual({
      kind: "replier_chosen",
      audience: "all",
      data: { cycle: 1, slot: 1, seat: 6, score: 4, tied: [6] },
    });
    expect(actors(r.state)).toEqual([6]);
    expect(turnsOf(r.state)[0]!.prompt).toMatch(/Right of Reply/);
    expect(werewolf.validate(r.state, 5, speak("me too")).ok).toBe(false);

    const reply = act(r.state, () => speak("I am innocent"));
    expect(speeches(reply.events)).toEqual([expect.objectContaining({ seat: 6, round: "reply", text: "I am innocent" })]);
    expect(actionOf(reply.state)).toBe("vote");
  });

  it("with two slots, the second goes to the next-highest seat, never the same Replier twice", () => {
    const { state } = day1("reply", { replySlots: 2 });
    const r = roundsAB(
      state,
      (seat) => ([1, 2, 4].includes(seat) ? accuse(5) : null),
      (seat) => ([1, 2].includes(seat) ? accuse(6) : null),
    );
    // Seat 6 replies first and still has the top score, but has already replied.
    const second = act(r.state, () => speak("not me"));
    expect(second.events.at(-1)?.data).toMatchObject({ slot: 2, seat: 5, score: 3 });
    expect(actors(second.state)).toEqual([5]);
    const done = act(second.state, () => speak("nor me"));
    expect(actionOf(done.state)).toBe("vote");
    expect(kinds(done.events)).toEqual(["speech"]);
  });

  it("only seats with at least 1 point can reply: one accused seat means one reply, even with two slots", () => {
    const { state } = day1("reply", { replySlots: 2 });
    const r = roundsAB(state, (seat) => (seat === 1 ? accuse(3) : null));
    expect(r.events.at(-1)?.data).toMatchObject({ slot: 1, seat: 3, score: 1 });
    const after = act(r.state, () => null);
    expect(speeches(after.events)).toEqual([expect.objectContaining({ seat: 3, skipped: true })]);
    expect(actionOf(after.state)).toBe("vote");
  });

  it("Accusations made in a reply do not count towards Right of Reply", () => {
    const { state } = day1("reply", { replySlots: 2 });
    const r = roundsAB(state, (seat) => (seat === 1 ? accuse(3) : null));
    const after = act(r.state, () => accuse(4));
    expect(actionOf(after.state)).toBe("vote");
  });

  it("breaks ties by the match seed: the same seed always picks the same Replier, different seeds differ", () => {
    const pick = (seed: string) => {
      const { state } = day1(seed, { replySlots: 1 });
      // Seat 1 accuses seat 2 and seat 3 accuses seat 4 in Round A: a 1-1 tie.
      const r = roundsAB(state, (seat) => (seat === 1 ? accuse(2) : seat === 3 ? accuse(4) : null));
      const chosen = r.events.at(-1)!;
      expect(chosen.data.tied).toEqual([2, 4]);
      return chosen.data.seat as number;
    };
    const seeds = Array.from({ length: 12 }, (_, i) => `tie-${i}`);
    const picks = seeds.map(pick);
    expect(seeds.map(pick)).toEqual(picks);
    expect(new Set(picks)).toEqual(new Set([2, 4]));
  });
});

describe("Werewolf Day vote", () => {
  it("eliminates the plurality target, reveals its role and starts the next Night", () => {
    const { state, wolves, villagers, seer, doctor } = day1Vote();
    const [a, b, c, d] = villagers;
    const { state: next, events } = voteAll(state, { [a!]: wolves[0]!, [b!]: wolves[0]!, [c!]: wolves[0]!, [d!]: a! });
    // With one Werewolf left there is no Wolf Chat: the Night goes straight to its actions.
    expect(events.find((e) => e.kind === "player_died")).toMatchObject({
      audience: "all",
      data: { seat: wolves[0], role: "werewolf", cause: "vote", cycle: 1 },
    });
    expect(events.find((e) => e.kind === "phase_started")?.data).toEqual({ phase: "night", cycle: 2 });
    expect(actors(next)).toEqual([wolves[1]!, seer, doctor].sort((x, y) => x - y));
  });

  it("publishes every ballot, with timeouts shown as Abstain", () => {
    const { state, wolves, villagers } = day1Vote();
    const { events } = act(state, (s) => (s === villagers[0] ? null : vote(wolves[0]!)));
    const votes = events.find((e) => e.kind === "votes_revealed")!.data.votes as { seat: number; target: unknown }[];
    expect(votes).toHaveLength(7);
    expect(votes.find((v) => v.seat === villagers[0])).toMatchObject({ target: "abstain", timedOut: true });
  });

  it("eliminates nobody on a tie", () => {
    const { state, wolves, villagers } = day1Vote();
    const [a, b] = villagers;
    const { events } = voteAll(state, { [a!]: wolves[0]!, [b!]: wolves[1]! });
    expect(events.some((e) => e.kind === "player_died")).toBe(false);
    expect(events.find((e) => e.kind === "no_elimination")?.data).toEqual({ cycle: 1, reason: "tie" });
  });

  it("eliminates nobody when everyone abstains", () => {
    const { state } = day1Vote();
    const { events } = voteAll(state, {});
    expect(events.find((e) => e.kind === "no_elimination")?.data).toEqual({ cycle: 1, reason: "all_abstain" });
  });

  it("only allows living players other than yourself, or abstain", () => {
    const { state, villagers } = day1Vote();
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

describe("Werewolf Day vote: Abstain rules", () => {
  it("with voluntary Abstain disabled, abstain is not a legal target but a timed-out vote still counts as Abstain", () => {
    const { state, wolves, villagers } = day1Vote("table", { allowAbstain: false });
    const me = villagers[0]!;
    expect(turnsOf(state).find((t) => t.seat === me)!.legalTargets).not.toContain("abstain");
    expect(werewolf.validate(state, me, vote("abstain"))).toEqual({
      ok: false,
      error: expect.stringContaining("Required action: vote"),
    });
    const { events } = act(state, (s) => (s === villagers[1] ? vote(wolves[0]!) : null));
    const votes = events.find((e) => e.kind === "votes_revealed")!.data.votes as { seat: number }[];
    expect(votes.find((v) => v.seat === me)).toEqual({ seat: me, target: "abstain", reason: null, timedOut: true });
    expect(events.find((e) => e.kind === "player_died")?.data.seat).toBe(wolves[0]);
  });
});

describe("Werewolf Day vote: beliefs", () => {
  /** Day 1 vote where one voter votes with `beliefs` and everyone else times out. */
  function ballotOf(voter: "wolf" | "village", beliefs: Record<number, number> | undefined) {
    const t = day1Vote("beliefs");
    const seat = voter === "wolf" ? t.wolves[0]! : t.villagers[0]!;
    const call: ToolCall = { name: "vote", args: { target: "abstain", reason: "r", ...(beliefs ? { beliefs } : {}) } };
    const r = act(t.state, (s) => (s === seat ? call : null));
    const recorded = r.events.find((e) => e.kind === "beliefs_recorded")!;
    const ballots = recorded.data.ballots as { seat: number; beliefs: Record<string, number> }[];
    return { ...t, seat, recorded, ballots };
  }
  const expectBeliefs = (actual: Record<string, number>, expected: Record<number, number>) => {
    expect(Object.keys(actual).map(Number).sort()).toEqual(Object.keys(expected).map(Number).sort());
    for (const [k, v] of Object.entries(expected)) expect(actual[k]).toBeCloseTo(v, 12);
  };
  /** A village voter's other seats: the other villagers, then the wolves. */
  const villageOthers = (t: { villagers: number[]; wolves: number[] }) => [...t.villagers.slice(1), ...t.wolves];

  it("records beliefs for Narrator's View only, and a timed-out vote has no ballot", () => {
    const { recorded, ballots, seat } = ballotOf("village", {});
    expect(recorded.audience).toEqual([]);
    expect(ballots.map((b) => b.seat)).toEqual([seat]);
    expect(werewolf.view([recorded], { seat })).toEqual([]);
    expect(werewolf.view([recorded], { spectator: true, narratorView: false })).toEqual([]);
    expect(werewolf.view([recorded], { spectator: true, narratorView: true })).toEqual([recorded]);
  });

  it("a concentrated village ballot [1, 0, 0, ...] with target 2 is capped at 1 and the excess spread evenly", () => {
    const others = villageOthers(day1Vote("beliefs"));
    const { ballots } = ballotOf("village", Object.fromEntries(others.map((s, i) => [s, i === 0 ? 1 : 0])));
    // Scaled to sum 2 -> [2, 0, 0, 0, 0, 0]; cap -> 1; the excess 1 over 5 seats -> 0.2 each.
    expectBeliefs(ballots[0]!.beliefs, Object.fromEntries(others.map((s, i) => [s, i === 0 ? 1 : 0.2])));
  });

  it("caps after scaling and spreads the excess: {a: 1, b: 0.2} with target 2", () => {
    const [a, b, ...rest] = villageOthers(day1Vote("beliefs"));
    const { ballots } = ballotOf("village", { [a!]: 1, [b!]: 0.2 });
    // Scaled x2/1.2 -> a 5/3, b 1/3; cap a at 1, spread 2/3 over 5 seats: b 1/3 + 2/15 = 7/15, others 2/15.
    expectBeliefs(ballots[0]!.beliefs, { [a!]: 1, [b!]: 7 / 15, ...Object.fromEntries(rest.map((s) => [s, 2 / 15])) });
  });

  it("a Werewolf voter's ballot is normalized to W-1 = 1, its partner being among the others", () => {
    const t = day1Vote("beliefs");
    const partner = t.wolves[1]!;
    const [x, y] = t.villagers;
    const { ballots } = ballotOf("wolf", { [x!]: 2, [y!]: 2, [partner]: 0, 99: 5 });
    const others = [...t.villagers, partner];
    expectBeliefs(ballots[0]!.beliefs, Object.fromEntries(others.map((s) => [s, s === x || s === y ? 0.5 : 0])));
  });

  it("an all-zero or missing ballot becomes uniform", () => {
    const others = villageOthers(day1Vote("beliefs"));
    const uniform = Object.fromEntries(others.map((s) => [s, 2 / 6]));
    expectBeliefs(ballotOf("village", Object.fromEntries(others.map((s) => [s, 0]))).ballots[0]!.beliefs, uniform);
    expectBeliefs(ballotOf("village", undefined).ballots[0]!.beliefs, uniform);
  });

  it("carries every normalized ballot into the Match result", () => {
    const t = day1Vote("beliefs");
    const ones = (seat: number) => Object.fromEntries(actors(t.state).filter((o) => o !== seat).map((o) => [o, 1]));
    let s = act(t.state, (seat) => vote("abstain", ones(seat))).state;
    const lynch = (st: WerewolfState, target: number) =>
      voteAll(st, Object.fromEntries(actors(st).filter((x) => x !== target).map((x) => [x, target]))).state;
    s = lynch(nightKill(s, null).state, t.wolves[0]!);
    s = lynch(nightKill(s, null).state, t.wolves[1]!);
    const result = werewolf.result(s)!;
    expect(result.winner).toBe("village");
    expect(result.ballots!.map((b) => b.round)).toEqual([...Array(7).fill(1), ...Array(7).fill(2), ...Array(6).fill(3)]);
    // A ballot of all 1s from a villager: 6 others with 2 wolves -> 1/3 each.
    const v = result.ballots!.find((b) => b.round === 1 && b.seat === t.villagers[0])!;
    expectBeliefs(v.beliefs, Object.fromEntries(villageOthers(t).map((o) => [o, 1 / 3])));
  });
});
