// What Agents read: the first-turn briefing and per-turn observations.
// Each phase module exports its own event describers; this file merges them.

import type { Seat, TurnRequest } from "../../core/ruleset";
import type { RulesetEvent } from "../../shared/protocol";
import { DAY_RULES, dayText } from "./day";
import { nightText } from "./night";
import { player, wolfSeats } from "./players";
import type { WerewolfState } from "./types";

export type EventDescriber = (data: Record<string, unknown>, s: WerewolfState) => string | null;

const label = (s: WerewolfState, seat: unknown) => {
  const p = player(s, Number(seat));
  return p ? `Seat ${p.seat} (${p.label})` : `Seat ${String(seat)}`;
};

const commonText: Record<string, EventDescriber> = {
  phase_started: (d) => `--- ${d.phase === "night" ? "Night" : "Day"} ${d.cycle} begins ---`,
  player_died: (d, s) =>
    `${label(s, d.seat)} ${d.cause === "vote" ? "was eliminated by vote" : "was killed in the Night"}. Their role was ${d.role}.`,
  match_over: (d) => `The Match is over. Winner: ${d.winner === "wolf" ? "the Werewolves" : "the Village"}.`,
  // Setup events are covered by the briefing.
  match_setup: () => null,
  role_assigned: () => null,
  wolf_team: () => null,
};

const DESCRIBERS: Record<string, EventDescriber> = { ...commonText, ...nightText, ...dayText };

export function describeEvent(e: RulesetEvent, s: WerewolfState): string | null {
  const fn = DESCRIBERS[e.kind];
  return fn ? fn(e.data, s) : null;
}

export const RULES = `You are playing Werewolf.
- Two Werewolves hide among the players; everyone else is on the Village side.
- Each Night the Werewolves choose one player to kill.
${DAY_RULES}
- A dead player's role is revealed. Dead players no longer act.
- The Village wins when every Werewolf is dead. The Werewolves win when they equal or outnumber the Village, or if any survive after the 6th Day/Night cycle.
- On each turn you are told the required action. Call exactly that tool with legal arguments.`;

export function briefing(s: WerewolfState, seat: Seat): string {
  const me = player(s, seat)!;
  const lines = [RULES, "", "Seats:", ...s.players.map((p) => `- Seat ${p.seat}: ${p.label}`), ""];
  lines.push(`You are seat ${seat}. Your secret role: ${me.role === "werewolf" ? "Werewolf" : "Villager"}.`);
  if (me.role === "werewolf") {
    const partner = wolfSeats(s).filter((w) => w !== seat);
    lines.push(`Your Werewolf partner is seat ${partner.join(", ")}.`);
  }
  return lines.join("\n");
}

export function renderObservation(s: WerewolfState, _seat: Seat, newEvents: RulesetEvent[], turn: TurnRequest): string {
  const happened = newEvents.map((e) => describeEvent(e, s)).filter((t): t is string => !!t);
  return [happened.length ? `What happened:\n${happened.join("\n")}` : "", `Your turn: ${turn.prompt}`]
    .filter(Boolean)
    .join("\n\n");
}
