import type { AgentRatingChange } from "../../src/shared/protocol";
import { formatRating, sideName } from "../components/Leaderboard";
import { seatLabel, type EventRenderer } from "./types";

/** Runner bookkeeping shown as seat markers rather than log lines. */
export const HIDDEN_KINDS = new Set(["turn_started", "step_resolved"]);

type DramaFlag = { id: string; active: boolean };
const activeFlags = (d: Record<string, unknown>) =>
  ((d.flags as DramaFlag[] | undefined) ?? []).filter((f) => f.active).map((f) => f.id.replace(/_/g, " "));

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;

export const runnerEvents: Record<string, EventRenderer> = {
  drama: (d) => {
    const flags = activeFlags(d);
    return `Narrator: Drama Score ${Math.round(Number(d.dramaScore) * 100)}%` + (flags.length ? `; ${flags.join(", ")}.` : ".");
  },
  drama_secret: (d) => {
    const flags = activeFlags(d);
    return `Narrator (God View): ${flags.length ? flags.join(", ") : "no secret Drama Flags"}.`;
  },
  // RatingChanges (src/shared/protocol.ts); the end screen (wl-hozk) can render it richer.
  ratings_settled: (d, log) => {
    const seats = (log.find((e) => e.kind === "match_setup")?.data.seats ?? []) as { agentId: string; label: string }[];
    const name = (id: string) => seats.find((s) => s.agentId === id)?.label.replace(/ #\d+$/, "") ?? id;
    const agents = (d.agents ?? []) as AgentRatingChange[];
    const lines = agents.map((a) => `${name(a.agentId)} ${sideName(a.side)} ${signed(a.delta)} (${formatRating(a.before)} → ${formatRating(a.after)})`);
    return `Ratings updated: ${lines.join("; ")}.`;
  },
  turn_timed_out: (d, log) =>
    `${seatLabel(d.seat, log)} timed out on ${d.actionKind}; the default action was applied` +
    (d.by === "backstop" ? " (expired by the Match backstop)." : d.by === "late" ? " (its answer arrived too late)." : "."),
};
