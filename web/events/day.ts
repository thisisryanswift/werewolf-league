import { seatLabel, type EventRenderer } from "./types";

export const dayEvents: Record<string, EventRenderer> = {
  votes_revealed: (d, log) =>
    `Day ${d.cycle} votes: ` +
    (d.votes as { seat: number; target: number | "abstain"; timedOut: boolean }[])
      .map((v) => `${seatLabel(v.seat, log)} → ${v.target === "abstain" ? "Abstain" : `seat ${v.target}`}${v.timedOut ? " (default)" : ""}`)
      .join("; "),
  no_elimination: (d) => `Day ${d.cycle}: nobody eliminated (${d.reason === "tie" ? "tie" : "all abstained"}).`,
};
