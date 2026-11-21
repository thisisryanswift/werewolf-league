// Night: Wolf Chat, then the Werewolves choose a kill.

import type { Seat, ToolCall, TurnRequest, Validation } from "../../core/ruleset";
import { rngFrom } from "../../core/rng";
import type { RulesetEvent } from "../../shared/protocol";
import { alive, aliveWolves, killPlayer, player, wolfSeats } from "./players";
import { SIDE_OF, type NightState, type PhaseModule, type PlayerState, type Role, type WerewolfState } from "./types";
import { targetOf, validateTargeted } from "./validation";

/** Wolf Chat exchanges per Night. */
export const WOLF_CHAT_EXCHANGES = 2;

/**
 * Night sub-state for a new Night. `players` are the Players as the Night starts;
 * `previous` is the last Night's sub-state (null before Night 1).
 */
export function startNight(players: PlayerState[], previous: NightState | null): NightState {
  const wolves = players.filter((p) => p.alive && p.role === "werewolf").length;
  return {
    step: wolves >= 2 && WOLF_CHAT_EXCHANGES > 0 ? "wolf_chat" : "act",
    exchange: 1,
    lastProtected: previous?.lastProtected ?? null,
  };
}

/**
 * Tonight's Pack Leader: the match seed picks which Werewolf leads Night 1, and the
 * role alternates each Night. If that wolf is dead, the surviving wolf leads.
 */
export function packLeader(s: WerewolfState): Seat | null {
  const wolves = wolfSeats(s);
  const living = aliveWolves(s).map((p) => p.seat);
  const offset = rngFrom(`${s.seed}:pack-leader`).int(wolves.length);
  const scheduled = wolves[(offset + s.cycle - 1) % wolves.length]!;
  return living.includes(scheduled) ? scheduled : (living[0] ?? null);
}

const leaderLine = (s: WerewolfState, seat: Seat) => {
  const leader = packLeader(s);
  return leader === seat
    ? `Tonight's Pack Leader is seat ${leader} (you): if the two of you choose different kills, your choice decides.`
    : `Tonight's Pack Leader is seat ${leader} (your partner): if the two of you choose different kills, their choice decides.`;
};

function chatTurns(s: WerewolfState): TurnRequest[] {
  return aliveWolves(s).map((w) => ({
    seat: w.seat,
    actionKind: "wolf_chat",
    legalTargets: [],
    prompt:
      `Night ${s.cycle}, Wolf Chat exchange ${s.night.exchange} of ${WOLF_CHAT_EXCHANGES}: ` +
      `send your Werewolf partner a private message with wolf_chat. ${leaderLine(s, w.seat)}`,
  }));
}

function actTurns(s: WerewolfState): TurnRequest[] {
  const legalTargets = alive(s)
    .filter((p) => p.role !== "werewolf")
    .map((p) => p.seat);
  const pack = aliveWolves(s).length > 1;
  const out: TurnRequest[] = aliveWolves(s).map((w) => ({
    seat: w.seat,
    actionKind: "choose_kill",
    legalTargets,
    prompt:
      `Night ${s.cycle}: choose a player to kill with choose_kill. Legal targets: ${legalTargets.join(", ")}.` +
      (pack ? ` ${leaderLine(s, w.seat)}` : ""),
  }));
  const seer = alive(s).find((p) => p.role === "seer");
  if (seer) {
    const targets = alive(s).filter((p) => p.seat !== seer.seat).map((p) => p.seat);
    out.push({
      seat: seer.seat,
      actionKind: "inspect",
      legalTargets: targets,
      prompt: `Night ${s.cycle}: inspect a player with inspect to learn their Side. Legal targets: ${targets.join(", ")}.`,
    });
  }
  const doctor = alive(s).find((p) => p.role === "doctor");
  if (doctor) {
    const last = s.night.lastProtected;
    const targets = alive(s).filter((p) => p.seat !== last).map((p) => p.seat);
    out.push({
      seat: doctor.seat,
      actionKind: "protect",
      legalTargets: targets,
      prompt:
        `Night ${s.cycle}: protect a player from tonight's kill with protect (yourself allowed). Legal targets: ${targets.join(", ")}.` +
        (last !== null ? ` You protected seat ${last} last Night, so you cannot protect them again tonight.` : ""),
    });
  }
  return out.sort((a, b) => a.seat - b.seat);
}

function turns(s: WerewolfState): TurnRequest[] {
  return s.night.step === "wolf_chat" ? chatTurns(s) : actTurns(s);
}

const chatText = (call: ToolCall | null | undefined): string | null => {
  const text = call?.args.text;
  return typeof text === "string" && text.trim() ? text : null;
};

function validate(s: WerewolfState, seat: Seat, call: ToolCall): Validation {
  const turn = turns(s).find((t) => t.seat === seat);
  const last = s.night.lastProtected;
  if (turn?.actionKind === "protect" && call.name === "protect" && last !== null && targetOf(call) === last) {
    return {
      ok: false,
      error:
        `The Doctor cannot protect the same player on consecutive Nights: you protected seat ${last} last Night. ` +
        `Required action: protect with target one of ${turn.legalTargets.join(", ")}.`,
    };
  }
  if (turn?.actionKind !== "wolf_chat") return validateTargeted(turn, seat, call);
  const required = "Required action: wolf_chat with a non-empty text message for your partner.";
  if (call.name !== "wolf_chat") return { ok: false, error: `${call.name} is not allowed now. ${required}` };
  if (!chatText(call)) return { ok: false, error: `wolf_chat needs text. ${required}` };
  return { ok: true };
}

function applyChat(s: WerewolfState, actions: Record<Seat, ToolCall | null>): { state: WerewolfState; events: RulesetEvent[] } {
  const wolves = wolfSeats(s);
  const events: RulesetEvent[] = [];
  for (const t of chatTurns(s)) {
    const text = chatText(actions[t.seat]);
    if (text === null) continue;
    events.push({ kind: "wolf_chat", audience: wolves, data: { cycle: s.cycle, exchange: s.night.exchange, seat: t.seat, text } });
  }
  const night: NightState =
    s.night.exchange < WOLF_CHAT_EXCHANGES
      ? { ...s.night, exchange: s.night.exchange + 1 }
      : { ...s.night, step: "act" };
  return { state: { ...s, night }, events };
}

function applyAct(s: WerewolfState, actions: Record<Seat, ToolCall | null>): { state: WerewolfState; events: RulesetEvent[] } {
  const wolves = wolfSeats(s);
  const events: RulesetEvent[] = [];
  const proposals = new Map<Seat, Seat>();
  let protectedSeat: Seat | null = null;
  // Calls reaching here were validated; the target check guards against defaults only.
  for (const t of actTurns(s)) {
    const target = targetOf(actions[t.seat]);
    if (typeof target !== "number" || !t.legalTargets.includes(target)) continue;
    if (t.actionKind === "choose_kill") {
      proposals.set(t.seat, target);
      events.push({ kind: "kill_chosen", audience: wolves, data: { cycle: s.cycle, seat: t.seat, target } });
    } else if (t.actionKind === "inspect") {
      events.push({
        kind: "seer_result",
        audience: [t.seat],
        data: { cycle: s.cycle, seat: t.seat, target, side: SIDE_OF[player(s, target)!.role] },
      });
    } else if (t.actionKind === "protect") {
      protectedSeat = target;
      events.push({ kind: "protect_chosen", audience: [t.seat], data: { cycle: s.cycle, seat: t.seat, target } });
    }
  }
  // A split goes to the Pack Leader; a lone proposal is the kill whoever made it.
  const leader = packLeader(s);
  const chosen = (leader !== null ? proposals.get(leader) : undefined) ?? [...proposals.values()][0] ?? null;
  if (chosen !== null) {
    events.push({ kind: "kill_decided", audience: wolves, data: { cycle: s.cycle, packLeader: leader, target: chosen } });
  }
  const saved = chosen !== null && chosen === protectedSeat;
  if (saved) {
    const doctor = actTurns(s).find((t) => t.actionKind === "protect")!.seat;
    // God View only: an empty audience reaches no seat.
    events.push({ kind: "doctor_saved", audience: [], data: { cycle: s.cycle, seat: doctor, target: chosen } });
  }
  const killed = saved ? null : chosen;
  let state: WerewolfState = { ...s, night: { ...s.night, lastProtected: protectedSeat } };
  if (killed !== null) {
    state = killPlayer(state, killed);
    events.push({
      kind: "player_died",
      audience: "all",
      data: { seat: killed, role: player(s, killed)!.role, cause: "night_kill", cycle: s.cycle },
    });
  }
  events.push({ kind: "night_passed", audience: "all", data: { cycle: s.cycle, killed } });
  state = { ...state, phase: "day", day: { step: "vote" } };
  events.push({ kind: "phase_started", audience: "all", data: { phase: "day", cycle: s.cycle } });
  return { state, events };
}

/** Night rules for the first-turn briefing (see text.ts RULES). */
export const NIGHT_RULES = `- The Village side has one Seer and one Doctor; everyone else on it is a Villager.
- Each Night the two Werewolves first hold a private Wolf Chat (${WOLF_CHAT_EXCHANGES} exchanges), then each chooses a player to kill. If they choose differently, that Night's Pack Leader decides; the Pack Leader role passes to the other Werewolf each Night. If only one Werewolf chooses, that choice is the kill.
- At the same time the Seer inspects one player and privately learns their Side (wolf or village), and the Doctor protects one player from the kill. The Doctor may protect themself, but not the same player on consecutive Nights.`;

/** Display names of the roles, for briefings. */
export const ROLE_NAMES: Record<Role, string> = { werewolf: "Werewolf", seer: "Seer", doctor: "Doctor", villager: "Villager" };

/** Observation text for Night events (see text.ts). */
export const nightText: Record<string, (d: Record<string, unknown>) => string | null> = {
  wolf_chat: (d) => `Wolf Chat (Night ${d.cycle}) — seat ${d.seat}: ${String(d.text)}`,
  kill_chosen: (d) => `Werewolf seat ${d.seat} chose to kill seat ${d.target}.`,
  kill_decided: (d) => `Night ${d.cycle}: the Werewolves' kill is seat ${d.target} (Pack Leader: seat ${d.packLeader}).`,
  seer_result: (d) => `Your Night ${d.cycle} inspection: Seat ${d.target} is on the ${d.side} side.`,
  protect_chosen: (d) => `Night ${d.cycle}: you protected seat ${d.target}.`,
  doctor_saved: () => null,
  night_passed: (d) => (d.killed === null ? `Night ${d.cycle} passed and nobody died.` : null),
};

export const night: PhaseModule = {
  turns,
  validate,
  apply: (s, actions) => (s.night.step === "wolf_chat" ? applyChat(s, actions) : applyAct(s, actions)),
};
