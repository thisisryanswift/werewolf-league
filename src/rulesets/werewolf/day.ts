// Day: Speech Rounds (everyone at once), Right of Reply for the most-accused,
// then one simultaneous plurality vote with beliefs.
//
// Every step's speeches/ballots are published in presentation order: seat order
// from a starting seat that rotates each Day. The Match page uses the same order.

import type { Seat, ToolCall, TurnRequest, Validation } from "../../core/ruleset";
import { rngFrom } from "../../core/rng";
import type { RulesetEvent } from "../../shared/protocol";
import { normalizeBeliefs } from "./beliefs";
import { alive, asSeat, killPlayer, player } from "./players";
import type { DayState, PhaseModule, WerewolfState } from "./types";
import { targetOf, validateTargeted } from "./validation";

/** The Day lines of the rules briefing (text.ts). */
export const DAY_RULES = `- Each Day has Speech Rounds in which all living players speak at the same time; later rounds see the earlier ones. A speech may name players you accuse of being a Werewolf, players you defend, and a Claim of your own role (a Seer may add inspection results). Claims may be lies.
- After the Speech Rounds, the most-accused players get a Right of Reply (accusations in Round A count once, in Round B twice).
- The Day ends with one simultaneous vote. Give your P(werewolf) for every other living player and a short reason. The player with the most votes is eliminated; a tie, or everyone abstaining, eliminates nobody.`;

/** A fresh Day state. Night calls this when the Day starts. */
export function startDay(cycle: number): DayState {
  return { cycle, step: "speech", round: 1, accusations: [], replied: [] };
}

const roundName = (round: number) => String.fromCharCode(64 + round); // 1 -> "A"

/**
 * Living seats in presentation order: seat order starting from a seat that
 * rotates by one each Day, from a seeded offset. Dead seats are skipped.
 */
export function presentationOrder(s: WerewolfState): Seat[] {
  const seats = s.players.map((p) => p.seat).sort((a, b) => a - b);
  const offset = rngFrom(`${s.seed}:day:start`).int(seats.length);
  const start = seats[(offset + s.cycle - 1) % seats.length]!;
  const living = alive(s)
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  return [...living.filter((x) => x >= start), ...living.filter((x) => x < start)];
}

/** Right of Reply score per seat: an Accusation in Round r counts r times. */
export function replyScores(s: WerewolfState): Record<Seat, number> {
  const scores: Record<Seat, number> = {};
  for (const a of s.day.accusations) for (const t of a.targets) scores[t] = (scores[t] ?? 0) + a.round;
  return scores;
}

/**
 * The next Replier: the living seat with the highest score (at least 1) that has
 * not replied this Day. Ties are broken by the match seed.
 */
function nextReplier(s: WerewolfState): { seat: Seat; score: number; tied: Seat[] } | null {
  if (s.day.replied.length >= s.config.replySlots) return null;
  const scores = replyScores(s);
  const candidates = presentationOrder(s).filter((x) => (scores[x] ?? 0) >= 1 && !s.day.replied.includes(x));
  if (!candidates.length) return null;
  const top = Math.max(...candidates.map((x) => scores[x]!));
  const tied = candidates.filter((x) => scores[x] === top).sort((a, b) => a - b);
  const slot = s.day.replied.length + 1;
  const seat = tied.length === 1 ? tied[0]! : rngFrom(`${s.seed}:day:${s.cycle}:reply:${slot}`).shuffle(tied)[0]!;
  return { seat, score: top, tied };
}

// ---- turns ------------------------------------------------------------

function othersOf(s: WerewolfState, seat: Seat): Seat[] {
  return presentationOrder(s).filter((x) => x !== seat);
}

function turns(s: WerewolfState): TurnRequest[] {
  const d = s.day;
  if (d.step === "speech") {
    const name = roundName(d.round);
    return presentationOrder(s).map((seat) => {
      const others = othersOf(s, seat);
      return {
        seat,
        actionKind: "speak",
        legalTargets: others,
        prompt:
          `Day ${s.cycle}, Speech Round ${name} of ${s.config.speechRounds}: everyone speaks at once` +
          (d.round > 1 ? ", having heard the earlier rounds" : "") +
          `. Call speak with your text, optionally accuse and defend (seats from ${others.join(", ")}) and a claim of your role.`,
      };
    });
  }
  if (d.step === "reply") {
    const seat = d.replied.at(-1)!;
    const others = othersOf(s, seat);
    return [
      {
        seat,
        actionKind: "speak",
        legalTargets: others,
        prompt: `Day ${s.cycle}, Right of Reply: you are among the most accused. Call speak to answer your accusers (optionally accuse, defend and claim; seats from ${others.join(", ")}).`,
      },
    ];
  }
  return presentationOrder(s).map((seat) => {
    const others = othersOf(s, seat);
    const legalTargets: (Seat | string)[] = [...others];
    if (s.config.allowAbstain) legalTargets.push("abstain");
    return {
      seat,
      actionKind: "vote",
      legalTargets,
      prompt:
        `Day ${s.cycle}: vote to eliminate a player with vote. Legal targets: ${legalTargets.join(", ")}. ` +
        `Include beliefs: your P(werewolf) for each of seats ${others.join(", ")}, and a short reason.`,
    };
  });
}

// ---- speeches ---------------------------------------------------------

export interface Speech {
  text: string;
  accuse: Seat[];
  defend: Seat[];
  claim: { role: string; results: { seat: Seat; side: string }[] } | null;
}

/** Parse a speak call. Seats that are not other living players are dropped. */
function parseSpeech(call: ToolCall, legal: Seat[]): Speech | string {
  const { text, accuse, defend, claim } = call.args;
  if (typeof text !== "string" || !text.trim()) return "speak needs non-empty text.";
  const seats = (v: unknown, field: string): Seat[] | string => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) return `${field} must be a list of seat numbers.`;
    return [...new Set(v.map(asSeat).filter((x): x is Seat => x !== null && legal.includes(x)))];
  };
  const a = seats(accuse, "accuse");
  if (typeof a === "string") return a;
  const df = seats(defend, "defend");
  if (typeof df === "string") return df;
  let c: Speech["claim"] = null;
  if (claim !== undefined && claim !== null) {
    const raw = claim as { role?: unknown; results?: unknown };
    if (typeof raw !== "object" || typeof raw.role !== "string" || !raw.role.trim()) {
      return "claim must be an object with a role.";
    }
    if (raw.results !== undefined && !Array.isArray(raw.results)) return "claim.results must be a list of {seat, side}.";
    const results = ((raw.results as unknown[] | undefined) ?? []).flatMap((r) => {
      const o = (r ?? {}) as { seat?: unknown; side?: unknown };
      const seat = asSeat(o.seat);
      return seat !== null && typeof o.side === "string" ? [{ seat, side: o.side }] : [];
    });
    c = { role: raw.role.trim().toLowerCase(), results };
  }
  return { text, accuse: a, defend: df, claim: c };
}

function speechEvent(s: WerewolfState, round: string, seat: Seat, call: ToolCall | null, legal: Seat[]): RulesetEvent {
  const parsed = call ? parseSpeech(call, legal) : null;
  const speech = parsed && typeof parsed !== "string" ? parsed : null;
  return {
    kind: "speech",
    audience: "all",
    data: speech
      ? { cycle: s.cycle, round, seat, skipped: false, ...speech }
      : { cycle: s.cycle, round, seat, skipped: true, text: null, accuse: [], defend: [], claim: null },
  };
}

function validate(s: WerewolfState, seat: Seat, call: ToolCall): Validation {
  const turn = turns(s).find((t) => t.seat === seat);
  if (!turn || turn.actionKind !== "speak") return validateTargeted(turn, seat, call);
  const required = `Required action: speak with text, optional accuse and defend (seats from ${turn.legalTargets.join(", ")}) and an optional claim {role, results}.`;
  if (call.name !== "speak") return { ok: false, error: `${call.name} is not allowed now. ${required}` };
  const parsed = parseSpeech(call, turn.legalTargets as Seat[]);
  return typeof parsed === "string" ? { ok: false, error: `${parsed} ${required}` } : { ok: true };
}

// ---- resolving steps --------------------------------------------------

type Applied = { state: WerewolfState; events: RulesetEvent[] };

/** After the last Speech Round or a reply: the next Replier, or the vote. */
function toReplyOrVote(s: WerewolfState, events: RulesetEvent[]): Applied {
  const next = nextReplier(s);
  if (next) {
    const slot = s.day.replied.length + 1;
    events.push({ kind: "replier_chosen", audience: "all", data: { cycle: s.cycle, slot, ...next } });
    return { state: { ...s, day: { ...s.day, step: "reply", replied: [...s.day.replied, next.seat] } }, events };
  }
  if (!s.day.replied.length) events.push({ kind: "no_right_of_reply", audience: "all", data: { cycle: s.cycle } });
  return { state: { ...s, day: { ...s.day, step: "vote" } }, events };
}

function applySpeeches(s: WerewolfState, actions: Record<Seat, ToolCall | null>): Applied {
  const d = s.day;
  const reply = d.step === "reply";
  const round = reply ? "reply" : roundName(d.round);
  const events: RulesetEvent[] = [];
  const accusations = [...d.accusations];
  for (const t of turns(s)) {
    const e = speechEvent(s, round, t.seat, actions[t.seat] ?? null, t.legalTargets as Seat[]);
    events.push(e);
    const targets = e.data.accuse as Seat[];
    if (!reply && targets.length) accusations.push({ round: d.round, seat: t.seat, targets });
  }
  const state = { ...s, day: { ...d, accusations } };
  if (!reply && d.round < s.config.speechRounds) {
    return { state: { ...state, day: { ...state.day, round: d.round + 1 } }, events };
  }
  return toReplyOrVote(state, events);
}

function applyVote(s: WerewolfState, actions: Record<Seat, ToolCall | null>): Applied {
  const order = presentationOrder(s);
  const ballots = order.map((seat) => {
    const call = actions[seat];
    const target = targetOf(call);
    // A missing action is a timeout/default and always counts as Abstain, even when
    // voluntary Abstain is disabled.
    return call && target !== null
      ? { seat, target, reason: typeof call.args.reason === "string" ? call.args.reason : null, timedOut: false }
      : { seat, target: "abstain" as const, reason: null, timedOut: true };
  });
  // Beliefs: one normalized ballot per vote; a timed-out vote has none.
  const beliefBallots = order.flatMap((seat) => {
    const call = actions[seat];
    if (!call) return [];
    const others = order.filter((x) => x !== seat);
    const wolvesAmongOthers = others.filter((x) => player(s, x)!.role === "werewolf").length;
    return [{ seat, beliefs: normalizeBeliefs(call.args.beliefs, others, wolvesAmongOthers) }];
  });

  const events: RulesetEvent[] = [
    { kind: "votes_revealed", audience: "all", data: { cycle: s.cycle, votes: ballots } },
    // God View only: a ballot normalized to the wolves among the voter's others would reveal them.
    { kind: "beliefs_recorded", audience: [], data: { cycle: s.cycle, ballots: beliefBallots } },
  ];

  const tally = new Map<Seat, number>();
  for (const b of ballots) if (typeof b.target === "number") tally.set(b.target, (tally.get(b.target) ?? 0) + 1);
  const top = Math.max(0, ...tally.values());
  const leaders = [...tally].filter(([, n]) => n === top).map(([seat]) => seat);

  let state: WerewolfState = {
    ...s,
    ballots: [...s.ballots, ...beliefBallots.map((b) => ({ seat: b.seat, round: s.cycle, beliefs: b.beliefs }))],
  };
  if (leaders.length === 1) {
    const out = leaders[0]!;
    state = killPlayer(state, out);
    events.push({
      kind: "player_died",
      audience: "all",
      data: { seat: out, role: player(s, out)!.role, cause: "vote", cycle: s.cycle },
    });
  } else {
    events.push({ kind: "no_elimination", audience: "all", data: { cycle: s.cycle, reason: top === 0 ? "all_abstain" : "tie" } });
  }
  const cycle = s.cycle + 1;
  state = { ...state, phase: "night", cycle, night: { step: "kill" } };
  events.push({ kind: "phase_started", audience: "all", data: { phase: "night", cycle } });
  return { state, events };
}

function apply(s: WerewolfState, actions: Record<Seat, ToolCall | null>): Applied {
  return s.day.step === "vote" ? applyVote(s, actions) : applySpeeches(s, actions);
}

// ---- observation text -------------------------------------------------

const seatName = (s: WerewolfState, seat: unknown) => {
  const p = player(s, Number(seat));
  return p ? `Seat ${p.seat} (${p.label})` : `Seat ${String(seat)}`;
};

function describeSpeech(d: Record<string, unknown>, s: WerewolfState): string {
  const who = `${seatName(s, d.seat)} [${d.round === "reply" ? "Right of Reply" : `Round ${d.round}`}]`;
  if (d.skipped) return `${who} said nothing.`;
  const parts = [`${who}: "${d.text}"`];
  const accuse = d.accuse as Seat[];
  const defend = d.defend as Seat[];
  const claim = d.claim as Speech["claim"];
  if (accuse.length) parts.push(`accuses ${accuse.map((x) => `seat ${x}`).join(", ")}`);
  if (defend.length) parts.push(`defends ${defend.map((x) => `seat ${x}`).join(", ")}`);
  if (claim) {
    const results = claim.results.map((r) => `seat ${r.seat} is ${r.side}`).join(", ");
    parts.push(`claims to be ${claim.role}${results ? ` (${results})` : ""}`);
  }
  return parts.join(" — ");
}

/** Observation text for Day events (see text.ts). */
export const dayText: Record<string, (d: Record<string, unknown>, s: WerewolfState) => string | null> = {
  speech: describeSpeech,
  replier_chosen: (d, s) => `${seatName(s, d.seat)} gets a Right of Reply (accusation score ${d.score}).`,
  no_right_of_reply: (d) => `Day ${d.cycle}: nobody was accused, so there is no Right of Reply.`,
  votes_revealed: (d) =>
    `Day ${d.cycle} votes: ` +
    (d.votes as { seat: number; target: unknown; reason: string | null }[])
      .map((v) => `${v.seat}→${String(v.target)}${v.reason ? ` ("${v.reason}")` : ""}`)
      .join(", "),
  beliefs_recorded: () => null,
  no_elimination: (d) => `Day ${d.cycle}: nobody was eliminated (${d.reason === "tie" ? "tie" : "everyone abstained"}).`,
};

export const day: PhaseModule = { turns, validate, apply };
