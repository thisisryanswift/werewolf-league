// Night: the Werewolves choose a kill.
// Night roles (Seer, Doctor, Wolf Chat, Pack Leader) extend this module.

import type { Seat, ToolCall, TurnRequest } from "../../core/ruleset";
import type { RulesetEvent } from "../../shared/protocol";
import { alive, aliveWolves, killPlayer, player, wolfSeats } from "./players";
import type { PhaseModule, WerewolfState } from "./types";
import { targetOf, validateTargeted } from "./validation";

function turns(s: WerewolfState): TurnRequest[] {
  const legalTargets = alive(s)
    .filter((p) => p.role !== "werewolf")
    .map((p) => p.seat);
  return aliveWolves(s).map((w) => ({
    seat: w.seat,
    actionKind: "choose_kill",
    legalTargets,
    prompt: `Night ${s.cycle}: choose a player to kill with choose_kill. Legal targets: ${legalTargets.join(", ")}.`,
  }));
}

function apply(s: WerewolfState, actions: Record<Seat, ToolCall | null>): { state: WerewolfState; events: RulesetEvent[] } {
  const wolves = wolfSeats(s);
  const events: RulesetEvent[] = [];
  const proposals: Seat[] = [];
  for (const t of turns(s)) {
    const target = targetOf(actions[t.seat]);
    if (typeof target !== "number") continue;
    proposals.push(target);
    events.push({ kind: "kill_chosen", audience: wolves, data: { seat: t.seat, target } });
  }
  // Minimal rule: the first proposal in seat order decides. Pack Leader replaces this.
  const killed = proposals[0] ?? null;
  let state = s;
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

/** Observation text for Night events (see text.ts). */
export const nightText: Record<string, (d: Record<string, unknown>) => string | null> = {
  kill_chosen: (d) => `Werewolf seat ${d.seat} chose to kill seat ${d.target}.`,
  night_passed: (d) => (d.killed === null ? `Night ${d.cycle} passed and nobody died.` : null),
};

export const night: PhaseModule = {
  turns,
  validate: (s, seat, call) => validateTargeted(turns(s).find((t) => t.seat === seat), seat, call),
  apply,
};
