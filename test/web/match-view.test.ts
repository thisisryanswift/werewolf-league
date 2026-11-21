// The Match view's model: what a Spectator sees for a given event log and God View setting.
import { describe, expect, it } from "vitest";
import type { MatchEvent, RulesetEvent } from "../../src/shared/protocol";
import { buildMatchView, panelsFor } from "../../web/match/model";

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
  it("God View off hides roles, Wolf Chat and private events; deaths still reveal the dead Player's role", () => {
    const log = logOf(night1);
    const off = buildMatchView(log, { godView: false });
    expect(off.seats.map((s) => s.role)).toEqual([null, null, null, null, "villager"]);
    const offKinds = off.feed.flatMap((g) => g.items.map((i) => i.event.kind));
    expect(offKinds).not.toContain("wolf_chat");
    expect(offKinds).not.toContain("seer_result");
    expect(offKinds).not.toContain("kill_decided");
    expect(offKinds).not.toContain("role_assigned");
    expect(offKinds).toContain("player_died");

    const on = buildMatchView(log, { godView: true });
    expect(on.seats.map((s) => s.role)).toEqual(["werewolf", "werewolf", "seer", "doctor", "villager"]);
    const wolfChat = on.feed.flatMap((g) => g.items).find((i) => i.event.kind === "wolf_chat");
    expect(wolfChat?.godViewOnly).toBe(true);
  });

  it("groups the feed by Night / Round A / Round B / Right of Reply / Vote, and each vote has a tally", () => {
    const view = buildMatchView(logOf([...night1, ...day1]), { godView: false });
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

  it("puts a step's timeout markers in that step's group (God View only)", () => {
    const on = buildMatchView(logOf([...night1, ...day1]), { godView: true });
    const roundA = on.feed.find((g) => g.title === "Day 1 · Round A")!;
    expect(roundA.items.map((i) => i.event.kind)).toContain("turn_timed_out");
  });

  it("the end screen shows the winner, every role, and each Agent's rating change once ratings settle", () => {
    const over = [
      ...night1,
      ...day1,
      pub("match_over", { winner: "wolf", reason: "parity", roles: { 1: "werewolf", 2: "werewolf", 3: "seer", 4: "doctor", 5: "villager" } }),
    ];
    const before = buildMatchView(logOf(over), { godView: false }).end;
    expect(before).toMatchObject({ winner: "wolf", reason: "parity", ratings: null });
    // Roles are public once the Match is over, even with God View off.
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
      { godView: false },
    ).end!;
    expect(settled.ratings).toEqual([
      { agentId: "a1", name: "Agent1", side: "wolf", before: 1200, delta: 16, after: 1216 },
      { agentId: "a3", name: "Agent3", side: "village", before: 1200, delta: -16, after: 1184 },
    ]);
    expect(buildMatchView(logOf(night1), { godView: true }).end).toBeNull();
    // Once over, seats show every role and judge every Claim, God View or not.
    const seats = buildMatchView(logOf(over), { godView: false }).seats;
    expect(seats.map((s) => s.role)).toEqual(["werewolf", "werewolf", "seer", "doctor", "villager"]);
    expect(seats.find((s) => s.seat === 3)!.claim?.truth).toBe("true");
  });

  it("shows each seat's latest Claim, judged true or a lie only when the role is known", () => {
    const log = logOf([...night1, ...day1]);
    const on = buildMatchView(log, { godView: true });
    expect(on.seats.find((s) => s.seat === 3)!.claim).toEqual({ role: "seer", results: [{ seat: 1, side: "wolf" }], truth: "true" });
    expect(on.seats.find((s) => s.seat === 1)!.claim).toMatchObject({ role: "seer", truth: "lie" });
    const off = buildMatchView(log, { godView: false });
    expect(off.seats.find((s) => s.seat === 3)!.claim).toMatchObject({ role: "seer", truth: null });
    // A dead Player's role is public, so their lie shows without God View.
    expect(off.seats.find((s) => s.seat === 1)!.claim).toMatchObject({ truth: "lie" });
    expect(off.seats.find((s) => s.seat === 4)!.claim).toBeNull();
  });

  it("links the latest Day's Accusations between Players", () => {
    const view = buildMatchView(logOf([...night1, ...day1]), { godView: false });
    expect(view.accusations).toEqual({
      cycle: 1,
      links: [
        { from: 3, to: 1, round: "A" },
        { from: 1, to: 3, round: "A" },
        { from: 3, to: 1, round: "B" },
        { from: 4, to: 1, round: "B" },
        { from: 1, to: 3, round: "B" },
      ],
    });
    expect(buildMatchView(logOf(night1), { godView: true }).accusations).toBeNull();
  });

  it("marks thinking seats and timeouts only in God View, since Night turns would reveal roles", () => {
    const midStep = logOf([
      ...night1,
      ...day1.slice(0, 6),
      priv("turn_started", [3], { step: 6, seat: 3, actionKind: "speak", deadlineMs: 1000 }),
      priv("turn_started", [4], { step: 6, seat: 4, actionKind: "speak", deadlineMs: 1000 }),
    ]);
    const on = buildMatchView(midStep, { godView: true });
    expect(on.seats.filter((s) => s.thinking).map((s) => s.seat)).toEqual([3, 4]);
    expect(on.seats.map((s) => s.timeouts)).toEqual([0, 1, 0, 0, 0]);
    const off = buildMatchView(midStep, { godView: false });
    expect(off.seats.some((s) => s.thinking || s.timeouts > 0)).toBe(false);
  });

  it("treats any event not addressed to everyone as God-View-only, whatever its kind", () => {
    // e.g. a Narrator result carrying a secret Drama Flag.
    const log = logOf([...night1, priv("drama_secret", [], { flags: ["a wolf is fooling the table"] })]);
    const kinds = (godView: boolean) => buildMatchView(log, { godView }).feed.flatMap((g) => g.items.map((i) => i.event.kind));
    expect(kinds(false)).not.toContain("drama_secret");
    expect(kinds(true)).toContain("drama_secret");
  });

  it("shows God-View-only panels only in God View", () => {
    const panels = [
      { id: "suspicion", godViewOnly: true },
      { id: "public", godViewOnly: false },
    ];
    expect(panelsFor(panels, false).map((p) => p.id)).toEqual(["public"]);
    expect(panelsFor(panels, true).map((p) => p.id)).toEqual(["suspicion", "public"]);
  });

  it("reports the phase and alive count", () => {
    expect(buildMatchView(logOf([...night1, ...day1]), { godView: false }).status).toEqual({ phase: "night", cycle: 2, alive: 3, total: 5 });
    expect(buildMatchView(logOf([]), { godView: false }).status).toEqual({ phase: null, cycle: 0, alive: 0, total: 0 });
  });
});
