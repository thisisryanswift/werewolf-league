// Events the Match runner adds to the event log alongside the Ruleset's events,
// and what Spectators derive from them (thinking indicators, timeout counts).
// Ruleset-agnostic. Per-seat events are private to that seat (Narrator's View sees
// them), so who is taking a turn never reveals a hidden role. Agents never see them.
//
//   turn_started   { step, seat, actionKind, deadlineMs }  audience [seat]   committed when a step is dispatched
//   turn_timed_out { step, seat, actionKind, by }          audience [seat]   committed when the step resolves, seat order
//   step_resolved  { step }                                audience "all"    committed before the Ruleset's events for the step
//   ratings_settled RatingChanges { players, agents }      audience "all"    committed once, after the Ruleset's last event, when
//                                                                            the League acknowledges a rated (League-scheduled) result
//   match_cost     MatchCostData (MatchCost minus byAgent)  audience "all"    committed when the Match finishes, and again if usage
//                                                                            arrives later (e.g. the last narration); the latest one wins
//   analysis       AnalysisEventData (core/analyst.ts)     audience []      committed once, after the result is settled, by the post-Match
//                                                                            Analyst (a report, or a recorded failure); Narrator's View only

import type { MatchCost, RatingChanges, RulesetEvent } from "./protocol";

/** The `match_cost` event's data. Per-Agent costs follow from the seats; leaving them out keeps Agent IDs out of the log. */
export type MatchCostData = Omit<MatchCost, "byAgent">;

/** The Match's public cost event. */
export function matchCostEvent(cost: MatchCost): RulesetEvent {
  const { byAgent: _byAgent, ...data } = cost;
  return { kind: "match_cost", audience: "all", data: { ...data } };
}

export const RUNNER_EVENT_KINDS: ReadonlySet<string> = new Set(["turn_started", "turn_timed_out", "step_resolved", "ratings_settled", "match_cost", "analysis"]);

/** The Match end event reporting each Player's and each Agent's rating change; null for an unrated Match. */
export function ratingsSettledEvent(changes: RatingChanges | null): RulesetEvent | null {
  return changes ? { kind: "ratings_settled", audience: "all", data: { ...changes } } : null;
}

export const isRunnerEvent = (e: { kind: string }): boolean => RUNNER_EVENT_KINDS.has(e.kind);

/** Who noticed the missed deadline: the Player DO, the Match backstop, or the Match on receiving a late answer. */
export type TimeoutSource = "player" | "backstop" | "late";

export interface TimeoutCounts {
  bySeat: Record<number, number>;
  byAgent: Record<string, number>;
}

type LoggedEvent = { kind: string; data: Record<string, unknown> };

/** Count timeouts per Player (seat) and per Agent from the event log. Every seat and Agent appears, zeros included. */
export function countTimeouts(events: LoggedEvent[], seats: { seat: number; agentId: string }[]): TimeoutCounts {
  const bySeat: Record<number, number> = {};
  const byAgent: Record<string, number> = {};
  for (const s of seats) {
    bySeat[s.seat] = 0;
    byAgent[s.agentId] = 0;
  }
  for (const e of events) {
    if (e.kind !== "turn_timed_out") continue;
    const seat = Number(e.data.seat);
    const agent = seats.find((s) => s.seat === seat)?.agentId;
    bySeat[seat] = (bySeat[seat] ?? 0) + 1;
    if (agent !== undefined) byAgent[agent] = (byAgent[agent] ?? 0) + 1;
  }
  return { bySeat, byAgent };
}

/** Seats whose turn is in flight: started in a step that has not resolved yet. */
export function thinkingSeats(events: LoggedEvent[]): number[] {
  let resolved = 0;
  for (const e of events) if (e.kind === "step_resolved") resolved = Math.max(resolved, Number(e.data.step));
  return events
    .filter((e) => e.kind === "turn_started" && Number(e.data.step) > resolved)
    .map((e) => Number(e.data.seat));
}
