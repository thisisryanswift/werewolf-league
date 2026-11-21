import { seatLabel, type EventRenderer } from "./types";

/** Runner bookkeeping shown as seat markers rather than log lines. */
export const HIDDEN_KINDS = new Set(["turn_started", "step_resolved"]);

type DramaFlag = { id: string; active: boolean };
const activeFlags = (d: Record<string, unknown>) =>
  ((d.flags as DramaFlag[] | undefined) ?? []).filter((f) => f.active).map((f) => f.id.replace(/_/g, " "));

export const runnerEvents: Record<string, EventRenderer> = {
  drama: (d) => {
    const flags = activeFlags(d);
    return `Narrator: Drama Score ${Math.round(Number(d.dramaScore) * 100)}%` + (flags.length ? `; ${flags.join(", ")}.` : ".");
  },
  drama_secret: (d) => {
    const flags = activeFlags(d);
    return `Narrator (God View): ${flags.length ? flags.join(", ") : "no secret Drama Flags"}.`;
  },
  turn_timed_out: (d, log) =>
    `${seatLabel(d.seat, log)} timed out on ${d.actionKind}; the default action was applied` +
    (d.by === "backstop" ? " (expired by the Match backstop)." : d.by === "late" ? " (its answer arrived too late)." : "."),
};
