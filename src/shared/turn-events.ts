// Events the Match runner adds to the event log alongside the Ruleset's events,
// and what Spectators derive from them (thinking indicators, timeout counts).
// Ruleset-agnostic. Per-seat events are private to that seat (God View sees
// them), so who is taking a turn never reveals a hidden role. Agents never see them.
//
//   turn_started   { step, seat, actionKind, deadlineMs }  audience [seat]   committed when a step is dispatched
//   turn_timed_out { step, seat, actionKind, by }          audience [seat]   committed when the step resolves, seat order
//   step_resolved  { step }                                audience "all"    committed before the Ruleset's events for the step

export const RUNNER_EVENT_KINDS: ReadonlySet<string> = new Set(["turn_started", "turn_timed_out", "step_resolved"]);

export const isRunnerEvent = (e: { kind: string }): boolean => RUNNER_EVENT_KINDS.has(e.kind);

/** Who noticed the missed deadline: the Player DO, or the Match's backstop. */
export type TimeoutSource = "player" | "backstop";

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
