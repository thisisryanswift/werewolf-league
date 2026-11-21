// Day: one simultaneous plurality vote.
// The Day-structure ticket adds Speech Rounds and Right of Reply before the vote.

import type { Seat, ToolCall, TurnRequest } from "../../core/ruleset";
import type { RulesetEvent } from "../../shared/protocol";
import { startNight } from "./night";
import { alive, killPlayer, player } from "./players";
import type { PhaseModule, WerewolfState } from "./types";
import { targetOf, validateTargeted } from "./validation";

function turns(s: WerewolfState): TurnRequest[] {
  const living = alive(s).map((p) => p.seat);
  return living.map((seat) => {
    const legalTargets: (Seat | string)[] = living.filter((t) => t !== seat);
    if (s.config.allowAbstain) legalTargets.push("abstain");
    return {
      seat,
      actionKind: "vote",
      legalTargets,
      prompt: `Day ${s.cycle}: vote to eliminate a player with vote. Legal targets: ${legalTargets.join(", ")}.`,
    };
  });
}

function apply(s: WerewolfState, actions: Record<Seat, ToolCall | null>): { state: WerewolfState; events: RulesetEvent[] } {
  const ballots = turns(s).map((t) => {
    const call = actions[t.seat];
    const target = targetOf(call);
    // A missing action is a timeout/default and always counts as Abstain.
    return call && target !== null
      ? { seat: t.seat, target, reason: call.args.reason ?? null, timedOut: false }
      : { seat: t.seat, target: "abstain" as const, reason: null, timedOut: true };
  });
  const events: RulesetEvent[] = [{ kind: "votes_revealed", audience: "all", data: { cycle: s.cycle, votes: ballots } }];

  const tally = new Map<Seat, number>();
  for (const b of ballots) if (typeof b.target === "number") tally.set(b.target, (tally.get(b.target) ?? 0) + 1);
  const top = Math.max(0, ...tally.values());
  const leaders = [...tally].filter(([, n]) => n === top).map(([seat]) => seat);

  let state: WerewolfState = s;
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
  state = { ...state, phase: "night", cycle, night: startNight(state.players, state.night) };
  events.push({ kind: "phase_started", audience: "all", data: { phase: "night", cycle } });
  return { state, events };
}

/** Observation text for Day events (see text.ts). */
export const dayText: Record<string, (d: Record<string, unknown>) => string | null> = {
  votes_revealed: (d) =>
    `Day ${d.cycle} votes: ` +
    (d.votes as { seat: number; target: unknown }[]).map((v) => `${v.seat}→${String(v.target)}`).join(", "),
  no_elimination: (d) => `Day ${d.cycle}: nobody was eliminated (${d.reason === "tie" ? "tie" : "everyone abstained"}).`,
};

export const day: PhaseModule = {
  turns,
  validate: (s, seat, call) => validateTargeted(turns(s).find((t) => t.seat === seat), seat, call),
  apply,
};
