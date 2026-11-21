// The Match view's model: what a Spectator sees for a given event log and Narrator's View setting.
import { describe, expect, it } from "vitest";
import type { MatchEvent, RulesetEvent } from "../../src/shared/protocol";
import { werewolf } from "../../src/rulesets/werewolf";
import { agentName, buildMatchView, panelsFor, playerLabel } from "../../web/match/model";
import { dealt, nightKill, seatsOf, speak, speakUntilVote } from "../werewolf/helpers";

/** Number events into a log, as the Match DO would. */
function logOf(events: RulesetEvent[]): MatchEvent[] {
  return events.map((e, i) => ({ ...e, seq: i + 1, ts: 1000 + i }));
}

const SEATS = [1, 2, 3, 4, 5].map((seat) => ({ seat, label: `Agent${seat} #1`, agentId: `a${seat}` }));
const pub = (kind: string, data: Record<string, unknown>): RulesetEvent => ({ kind, audience: "all", data });
const priv = (kind: string, audience: number[], data: Record<string, unknown>): RulesetEvent => ({ kind, audience, data });
const speech = (cycle: number, round: string, seat: number, extra: Record<string, unknown> = {}) =>
  pub("speech", { cycle, round, seat, skipped: false, text: `seat ${seat} talks`, accuse: [], defend: [], claim: null, ...extra });

// Roles: 1 werewolf, 2 werewolf, 3 seer, 4 doctor, 5 villager.
const night1: RulesetEvent[] = [
  pub("match_setup", { ruleset: "werewolf", seats: SEATS }),
  priv("role_assigned", [1], { seat: 1, role: "werewolf" }),
  priv("role_assigned", [2], { seat: 2, role: "werewolf" }),
  priv("role_assigned", [3], { seat: 3, role: "seer" }),
  priv("role_assigned", [4], { seat: 4, role: "doctor" }),
  priv("role_assigned", [5], { seat: 5, role: "villager" }),
  priv("wolf_team", [1, 2], { wolves: [1, 2] }),
  pub("phase_started", { phase: "night", cycle: 1 }),
  priv("turn_started", [1], { step: 1, seat: 1, actionKind: "wolf_chat", deadlineMs: 1000 }),
  pub("step_resolved", { step: 1 }),
  priv("wolf_chat", [1, 2], { cycle: 1, exchange: 1, seat: 1, text: "let's get the seer" }),
  priv("seer_result", [3], { cycle: 1, seat: 3, target: 1, side: "wolf" }),
  priv("kill_decided", [1, 2], { cycle: 1, packLeader: 1, target: 5 }),
  pub("player_died", { seat: 5, role: "villager", cause: "night_kill", cycle: 1 }),
  pub("night_passed", { cycle: 1, killed: 5 }),
  pub("phase_started", { phase: "day", cycle: 1 }),
];

// Day 1: two Speech Rounds, one Right of Reply, then a vote that eliminates seat 1.
const day1: RulesetEvent[] = [
  // The runner commits a step's timeouts and step_resolved before the step's Ruleset events.
  priv("turn_timed_out", [2], { step: 5, seat: 2, actionKind: "speak", by: "player" }),
  pub("step_resolved", { step: 5 }),
  speech(1, "A", 3, { accuse: [1], claim: { role: "seer", results: [{ seat: 1, side: "wolf" }] } }),
  speech(1, "A", 4),
  speech(1, "A", 1, { accuse: [3], claim: { role: "seer", results: [{ seat: 3, side: "wolf" }] } }),
  speech(1, "A", 2, { skipped: true, text: null }),
  speech(1, "B", 3, { accuse: [1] }),
  speech(1, "B", 4, { accuse: [1], defend: [3] }),
  speech(1, "B", 1, { accuse: [3] }),
  speech(1, "B", 2),
  pub("replier_chosen", { cycle: 1, slot: 1, seat: 1, score: 5, tied: [1] }),
  speech(1, "reply", 1, { text: "I am not a wolf" }),
  pub("votes_revealed", {
    cycle: 1,
    votes: [
      { seat: 3, target: 1, reason: "seer result", timedOut: false },
      { seat: 4, target: 1, reason: "trust the seer", timedOut: false },
      { seat: 1, target: 3, reason: "counter-claim", timedOut: false },
      { seat: 2, target: "abstain", reason: null, timedOut: true },
    ],
  }),
  priv("beliefs_recorded", [], { cycle: 1, ballots: [] }),
  pub("player_died", { seat: 1, role: "werewolf", cause: "vote", cycle: 1 }),
  pub("phase_started", { phase: "night", cycle: 2 }),
];

describe("Match view", () => {
  it("Narrator's View off hides roles, Wolf Chat and private events; deaths still reveal the dead Player's role", () => {
    const log = logOf(night1);
    const off = buildMatchView(log, { narratorView: false });
    expect(off.seats.map((s) => s.role)).toEqual([null, null, null, null, "villager"]);
    const offKinds = off.feed.flatMap((g) => g.items.map((i) => i.event.kind));
    expect(offKinds).not.toContain("wolf_chat");
    expect(offKinds).not.toContain("seer_result");
    expect(offKinds).not.toContain("kill_decided");
    expect(offKinds).not.toContain("role_assigned");
    expect(offKinds).toContain("player_died");

    const on = buildMatchView(log, { narratorView: true });
    expect(on.seats.map((s) => s.role)).toEqual(["werewolf", "werewolf", "seer", "doctor", "villager"]);
    const wolfChat = on.feed.flatMap((g) => g.items).find((i) => i.event.kind === "wolf_chat");
    expect(wolfChat?.narratorViewOnly).toBe(true);
  });

  it("groups the feed by Night / Round A / Round B / Right of Reply / Vote, and each vote has a tally", () => {
    const view = buildMatchView(logOf([...night1, ...day1]), { narratorView: false });
    expect(view.feed.map((g) => g.title)).toEqual([
      "Setup",
      "Night 1",
      "Day 1 · Round A",
      "Day 1 · Round B",
      "Day 1 · Right of Reply",
      "Day 1 · Vote",
      "Night 2",
    ]);
    const roundA = view.feed.find((g) => g.title === "Day 1 · Round A")!;
    // Presentation order is log order.
    expect(roundA.items.map((i) => i.event.data.seat)).toEqual([3, 4, 1, 2]);
    const vote = view.feed.find((g) => g.title === "Day 1 · Vote")!;
    expect(vote.tally).toEqual({
      counts: [
        { target: 1, votes: 2 },
        { target: 3, votes: 1 },
        { target: "abstain", votes: 1 },
      ],
      eliminated: 1,
      outcome: "eliminated",
    });
  });

  it("puts a step's timeout markers in that step's group (Narrator's View only)", () => {
    const on = buildMatchView(logOf([...night1, ...day1]), { narratorView: true });
    const roundA = on.feed.find((g) => g.title === "Day 1 · Round A")!;
    expect(roundA.items.map((i) => i.event.kind)).toContain("turn_timed_out");
  });

  it("the end screen shows the winner, every role, and each Agent's rating change once ratings settle", () => {
    const over = [
      ...night1,
      ...day1,
      pub("match_over", { winner: "wolf", reason: "parity", roles: { 1: "werewolf", 2: "werewolf", 3: "seer", 4: "doctor", 5: "villager" } }),
    ];
    const before = buildMatchView(logOf(over), { narratorView: false }).end;
    expect(before).toMatchObject({ winner: "wolf", reason: "parity", ratings: null });
    // Roles are public once the Match is over, even with Narrator's View off.
    expect(before!.roles.map((r) => [r.seat, r.role, r.alive])).toEqual([
      [1, "werewolf", false],
      [2, "werewolf", true],
      [3, "seer", true],
      [4, "doctor", true],
      [5, "villager", false],
    ]);

    const settled = buildMatchView(
      logOf([
        ...over,
        pub("ratings_settled", {
          players: [],
          agents: [
            { agentId: "a1", side: "wolf", before: 1200, delta: 16, after: 1216 },
            { agentId: "a3", side: "village", before: 1200, delta: -16, after: 1184 },
          ],
        }),
      ]),
      { narratorView: false },
    ).end!;
    expect(settled.ratings).toEqual([
      { agentId: "a1", name: "Agent1", side: "wolf", before: 1200, delta: 16, after: 1216 },
      { agentId: "a3", name: "Agent3", side: "village", before: 1200, delta: -16, after: 1184 },
    ]);
    expect(buildMatchView(logOf(night1), { narratorView: true }).end).toBeNull();
    expect(settled.cost).toBeNull();
    // Once over, seats show every role and judge every Claim, Narrator's View or not.
    const seats = buildMatchView(logOf(over), { narratorView: false }).seats;
    expect(seats.map((s) => s.role)).toEqual(["werewolf", "werewolf", "seer", "doctor", "villager"]);
    expect(seats.find((s) => s.seat === 3)!.claim?.truth).toBe("true");
  });

  it("the end screen shows the Match's final measured cost and each Agent's share, from the latest match_cost event", () => {
    // Seats 1 and 2 are copies of one Agent; the Narrator's cost is in the total but no Agent's.
    const seats = [
      { seat: 1, label: "Hydrogen #1", agentId: "h" },
      { seat: 2, label: "Hydrogen #2", agentId: "h" },
      { seat: 3, label: "Lite #1", agentId: "l" },
    ];
    const cost = (narrator: number) =>
      pub("match_cost", {
        total: 0.35 + narrator,
        bySeat: { 1: 0.1, 2: 0.2, 3: 0.05 },
        narrator,
        tokens: { input: 90_000, cached: 30_000, thought: 4_000, output: 1_000 },
        unpriced: [],
      });
    const log = logOf([
      pub("match_setup", { ruleset: "werewolf", seats }),
      pub("match_over", { winner: "village", reason: "all_werewolves_dead", roles: { 1: "werewolf", 2: "villager", 3: "seer" } }),
      cost(0.01),
      cost(0.02), // a late narration updated it
    ]);
    const view = buildMatchView(log, { narratorView: false });
    expect(view.end!.cost!.total).toBeCloseTo(0.37, 10);
    expect(view.end!.cost!.narrator).toBeCloseTo(0.02, 10);
    expect(view.end!.cost!.agents.map((a) => [a.agentId, a.name, Number(a.cost.toFixed(10))])).toEqual([
      ["h", "Hydrogen", 0.3],
      ["l", "Lite", 0.05],
    ]);
    // The cost is not a feed line.
    expect(view.feed.flatMap((g) => g.items.map((i) => i.event.kind))).not.toContain("match_cost");
  });

  it("the end screen shows the Analyst's report only in Narrator's View, and the Analyst's cost", () => {
    const report = {
      summary: "Wolves won.",
      turning_points: [
        { when: "Night 1", what: "A kill." },
        { when: "Day 1 vote", what: "A miss." },
      ],
      mistakes: [{ seat: 3, agent: "Agent3", what: "Voted wrong.", evidence: "Day 1 vote: 'trust me'." }],
      best_play: { seat: 1, why: "A good lie." },
      why_winner_won: "Village mistakes.",
    };
    const log = logOf([
      ...night1,
      ...day1,
      pub("match_over", { winner: "wolf", reason: "parity", roles: { 1: "werewolf", 2: "werewolf", 3: "seer", 4: "doctor", 5: "villager" } }),
      pub("match_cost", { total: 0.2, bySeat: {}, narrator: 0, analyst: 0.15, tokens: { input: 1, cached: 0, thought: 0, output: 0 }, unpriced: [] }),
      priv("analysis", [], { status: "ok", model: "gemini-4-neon", startedAt: 1, finishedAt: 81_001, report }),
    ]);
    const on = buildMatchView(log, { narratorView: true });
    expect(on.end!.analysis).toEqual({ status: "ok", model: "gemini-4-neon", seconds: 81, report });
    expect(on.end!.cost!.analyst).toBeCloseTo(0.15, 10);
    expect(buildMatchView(log, { narratorView: false }).end!.analysis).toBeNull();
    // Not a feed line.
    expect(on.feed.flatMap((g) => g.items.map((i) => i.event.kind))).not.toContain("analysis");
    // A recorded failure.
    const failed = logOf([
      ...night1,
      pub("match_over", { winner: "wolf", reason: "parity", roles: {} }),
      priv("analysis", [], { status: "failed", model: "gemini-4-neon", startedAt: null, finishedAt: 5, reason: "timeout" }),
    ]);
    expect(buildMatchView(failed, { narratorView: true }).end!.analysis).toEqual({ status: "failed", model: "gemini-4-neon", seconds: null, reason: "timeout" });
  });

  it("shows each seat's latest Claim, judged true or a lie only when the role is known", () => {
    const log = logOf([...night1, ...day1]);
    const on = buildMatchView(log, { narratorView: true });
    expect(on.seats.find((s) => s.seat === 3)!.claim).toEqual({ role: "seer", results: [{ seat: 1, side: "wolf" }], truth: "true" });
    expect(on.seats.find((s) => s.seat === 1)!.claim).toMatchObject({ role: "seer", truth: "lie" });
    const off = buildMatchView(log, { narratorView: false });
    expect(off.seats.find((s) => s.seat === 3)!.claim).toMatchObject({ role: "seer", truth: null });
    // A dead Player's role is public, so their lie shows without Narrator's View.
    expect(off.seats.find((s) => s.seat === 1)!.claim).toMatchObject({ truth: "lie" });
    expect(off.seats.find((s) => s.seat === 4)!.claim).toBeNull();
  });

  it("gives each seat its incoming and outgoing Accusation chips for the current Day, with Narrator's View on or off", () => {
    const log = logOf([...night1, ...day1.slice(0, 11)]);
    const off = buildMatchView(log, { narratorView: false });
    const chips = (seat: number) => off.seats.find((s) => s.seat === seat)!.accusations;
    expect(off.accusations).toEqual({ cycle: 1 });
    // Seat 3 accuses seat 1 in both Rounds: listed once.
    expect(chips(1)).toEqual({ by: [3, 4], accuses: [3], defends: [], score: 5, mostAccused: true, replier: true });
    expect(chips(3)).toEqual({ by: [1], accuses: [1], defends: [], score: 3, mostAccused: false, replier: false });
    expect(chips(4)).toEqual({ by: [], accuses: [1], defends: [3], score: 0, mostAccused: false, replier: false });
    expect(chips(2)).toEqual({ by: [], accuses: [], defends: [], score: 0, mostAccused: false, replier: false });
    // Accusations are public: Narrator's View changes nothing.
    expect(buildMatchView(log, { narratorView: true }).seats.map((s) => s.accusations)).toEqual(off.seats.map((s) => s.accusations));
    expect(buildMatchView(logOf(night1.slice(0, -1)), { narratorView: true }).accusations).toBeNull();
  });

  it("shows a Right of Reply speech's Accusations as chips without adding them to the reply score", () => {
    const log = logOf([...night1, ...day1.slice(0, 10), speech(1, "reply", 1, { accuse: [4] })]);
    const seat4 = buildMatchView(log, { narratorView: false }).seats.find((s) => s.seat === 4)!.accusations;
    expect(seat4).toMatchObject({ by: [1], score: 0, mostAccused: false });
  });

  it("weights a third Speech Round's Accusations three times, as the Ruleset does", () => {
    const log = logOf([...night1, speech(1, "A", 3, { accuse: [2] }), speech(1, "A", 4, { accuse: [2] }), speech(1, "C", 1, { accuse: [4] })]);
    const view = buildMatchView(log, { narratorView: false });
    expect(view.seats.find((s) => s.seat === 4)!.accusations).toMatchObject({ score: 3, mostAccused: true });
    expect(view.seats.find((s) => s.seat === 2)!.accusations).toMatchObject({ score: 2, mostAccused: false });
  });

  it("keeps the Day's chips through the following Night, resets them when the next Day starts, and keeps the final Day's once Over", () => {
    const night2 = buildMatchView(logOf([...night1, ...day1]), { narratorView: false });
    expect(night2.accusations).toEqual({ cycle: 1 });
    expect(night2.seats.find((s) => s.seat === 1)!.accusations.by).toEqual([3, 4]);
    const day2 = logOf([...night1, ...day1, pub("night_passed", { cycle: 2, killed: null }), pub("phase_started", { phase: "day", cycle: 2 })]);
    const fresh = buildMatchView(day2, { narratorView: false });
    expect(fresh.accusations).toEqual({ cycle: 2 });
    expect(fresh.seats.every((s) => !s.accusations.by.length && !s.accusations.accuses.length && !s.accusations.mostAccused)).toBe(true);
    const over = buildMatchView(
      logOf([
        ...night1,
        ...day1,
        pub("night_passed", { cycle: 2, killed: null }),
        pub("phase_started", { phase: "day", cycle: 2 }),
        speech(2, "A", 3, { accuse: [2] }),
        pub("match_over", { winner: "village", reason: "all_werewolves_dead", roles: {} }),
      ]),
      { narratorView: false },
    );
    expect(over.accusations).toEqual({ cycle: 2 });
    expect(over.seats.find((s) => s.seat === 2)!.accusations).toMatchObject({ by: [3], score: 1, mostAccused: true });
  });

  it("badges the most-accused and tags the Repliers exactly as the Ruleset chose them on a scripted Day", () => {
    const t = dealt("chips", 7, { replySlots: 2 });
    const setup = werewolf.setup({ replySlots: 2 }, "chips", seatsOf(7));
    if (!setup.ok) throw new Error(setup.error);
    const events: RulesetEvent[] = [...setup.events];
    const night = nightKill(t.state, null);
    events.push(...night.events);
    // Round A: 1 and 2 accuse 5 (2 points), 3 accuses 6 (1). Round B: 4 accuses 6 (2 more: 3), 7 accuses 5 (2 more: 4).
    const day = speakUntilVote(night.state, (seat, step) => {
      const a: Record<number, number> = step === 0 ? { 1: 5, 2: 5, 3: 6 } : step === 1 ? { 4: 6, 7: 5 } : {};
      return a[seat] ? speak("I accuse", { accuse: [a[seat]] }) : null;
    });
    events.push(...day.events);
    const chosen = events.filter((e) => e.kind === "replier_chosen");
    expect(chosen.map((e) => e.data.seat)).toEqual([5, 6]);
    const view = buildMatchView(logOf(events), { narratorView: false });
    const badged = view.seats.filter((s) => s.accusations.mostAccused);
    expect(badged.map((s) => [s.seat, s.accusations.score])).toEqual([[5, chosen[0]!.data.score]]);
    expect(view.seats.filter((s) => s.accusations.replier).map((s) => s.seat)).toEqual([5, 6]);
    expect(view.seats.find((s) => s.seat === 6)!.accusations.score).toBe(chosen[1]!.data.score);
  });

  it("marks thinking seats and timeouts only in Narrator's View, since Night turns would reveal roles", () => {
    const midStep = logOf([
      ...night1,
      ...day1.slice(0, 6),
      priv("turn_started", [3], { step: 6, seat: 3, actionKind: "speak", deadlineMs: 1000 }),
      priv("turn_started", [4], { step: 6, seat: 4, actionKind: "speak", deadlineMs: 1000 }),
    ]);
    const on = buildMatchView(midStep, { narratorView: true });
    expect(on.seats.filter((s) => s.thinking).map((s) => s.seat)).toEqual([3, 4]);
    expect(on.seats.map((s) => s.timeouts)).toEqual([0, 1, 0, 0, 0]);
    const off = buildMatchView(midStep, { narratorView: false });
    expect(off.seats.some((s) => s.thinking || s.timeouts > 0)).toBe(false);
  });

  it("treats any event not addressed to everyone as Narrator's-View-only, whatever its kind", () => {
    // e.g. a Narrator result carrying a secret Drama Flag.
    const log = logOf([...night1, priv("drama_secret", [], { flags: ["a wolf is fooling the table"] })]);
    const kinds = (narratorView: boolean) => buildMatchView(log, { narratorView }).feed.flatMap((g) => g.items.map((i) => i.event.kind));
    expect(kinds(false)).not.toContain("drama_secret");
    expect(kinds(true)).toContain("drama_secret");
  });

  it("shows Narrator's-View-only panels only in Narrator's View", () => {
    const panels = [
      { id: "suspicion", narratorViewOnly: true },
      { id: "public", narratorViewOnly: false },
    ];
    expect(panelsFor(panels, false).map((p) => p.id)).toEqual(["public"]);
    expect(panelsFor(panels, true).map((p) => p.id)).toEqual(["suspicion", "public"]);
  });

  it("reports the phase and alive count", () => {
    expect(buildMatchView(logOf([...night1, ...day1]), { narratorView: false }).status).toEqual({ phase: "night", cycle: 2, alive: 3, total: 5 });
    expect(buildMatchView(logOf([]), { narratorView: false }).status).toEqual({ phase: null, cycle: 0, alive: 0, total: 0 });
  });
});

describe("Match view Claims and labels", () => {
  const claimLog = (results: { seat: number; side: string }[]) =>
    logOf([...night1, speech(1, "A", 3, { claim: { role: "seer", results } })]);

  it("marks a true Seer's Claim a lie when a claimed inspection result is false", () => {
    const view = buildMatchView(claimLog([{ seat: 1, side: "wolf" }, { seat: 4, side: "wolf" }]), { narratorView: true });
    expect(view.seats.find((s) => s.seat === 3)!.claim).toMatchObject({ role: "seer", truth: "lie" });
  });

  it("marks a Claim true only when the role and every claimed result's Side match", () => {
    const view = buildMatchView(claimLog([{ seat: 1, side: "wolf" }, { seat: 4, side: "village" }]), { narratorView: true });
    expect(view.seats.find((s) => s.seat === 3)!.claim).toMatchObject({ truth: "true" });
  });

  it("does not judge a true role's Claim while a claimed seat's Side is hidden", () => {
    // Narrator's View off: seat 3's role is hidden anyway; once seat 3 dies its role is public but seat 4's is not.
    const log = logOf([
      ...night1,
      speech(1, "A", 3, { claim: { role: "seer", results: [{ seat: 4, side: "wolf" }] } }),
      pub("player_died", { seat: 3, role: "seer", cause: "vote", cycle: 1 }),
    ]);
    expect(buildMatchView(log, { narratorView: false }).seats.find((s) => s.seat === 3)!.claim).toMatchObject({ truth: null });
  });

  it("names seats 'Display Name · Agent #n', and Agents by name alone", () => {
    expect(playerLabel({ seat: 2, agentId: "h", label: "Hydrogen #2", displayName: "Mara" })).toBe("Mara · Hydrogen #2");
    expect(playerLabel({ seat: 2, agentId: "h", label: "Hydrogen #2" })).toBe("Hydrogen #2");
    expect(agentName({ seat: 2, agentId: "h", label: "Hydrogen #2", displayName: "Mara" })).toBe("Hydrogen");
  });
});
