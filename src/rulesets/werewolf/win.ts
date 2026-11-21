// Win conditions, checked after every resolved step.

import type { MatchResult } from "../../core/ruleset";
import type { RulesetEvent } from "../../shared/protocol";
import { alive, aliveWolves } from "./players";
import { SIDE_OF, type Side, type WerewolfState } from "./types";

export function winnerOf(s: WerewolfState): { winner: Side; reason: string } | null {
  const wolves = aliveWolves(s).length;
  const village = alive(s).length - wolves;
  if (wolves === 0) return { winner: "village", reason: "all_werewolves_dead" };
  if (wolves >= village) return { winner: "wolf", reason: "parity" };
  // Night N+1 would start after the Day of the last allowed cycle.
  if (s.phase === "night" && s.cycle > s.config.maxCycles) return { winner: "wolf", reason: "cycle_cap" };
  return null;
}

/** If the step just resolved ends the Match, close it out: no next phase, all roles revealed. */
export function settle(s: WerewolfState, events: RulesetEvent[]): { state: WerewolfState; events: RulesetEvent[] } {
  const win = winnerOf(s);
  if (!win) return { state: s, events };
  const roles = Object.fromEntries(s.players.map((p) => [p.seat, p.role]));
  return {
    state: { ...s, phase: "over", winner: win.winner },
    events: [
      ...events.filter((e) => e.kind !== "phase_started"),
      { kind: "match_over", audience: "all", data: { winner: win.winner, reason: win.reason, roles } },
    ],
  };
}

export function resultOf(s: WerewolfState): MatchResult | null {
  if (!s.winner) return null;
  return {
    winner: s.winner,
    sides: Object.fromEntries(s.players.map((p) => [p.seat, SIDE_OF[p.role]])),
    ballots: s.ballots,
  };
}
