import { seatLabel, type EventRenderer } from "./types";

/** Runner bookkeeping shown as seat markers rather than log lines. */
export const HIDDEN_KINDS = new Set(["turn_started", "step_resolved"]);

export const runnerEvents: Record<string, EventRenderer> = {
  turn_timed_out: (d, log) =>
    `${seatLabel(d.seat, log)} timed out on ${d.actionKind}; the default action was applied` +
    (d.by === "backstop" ? " (expired by the Match backstop)." : d.by === "late" ? " (its answer arrived too late)." : "."),
};
