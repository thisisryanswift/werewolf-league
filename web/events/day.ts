import { seatLabel, type EventRenderer } from "./types";

/** Data of a `speech` event (one per seat, committed in presentation order). */
export interface SpeechData {
  cycle: number;
  /** "A", "B", ... for Speech Rounds, or "reply" for Right of Reply. */
  round: string;
  seat: number;
  skipped: boolean;
  text: string | null;
  accuse: number[];
  defend: number[];
  claim: { role: string; results: { seat: number; side: string }[] } | null;
}

export const roundLabel = (round: string) => (round === "reply" ? "Right of Reply" : `Round ${round}`);

/** "Claims Seer: Seat 3 (X) is wolf". */
export function claimText(claim: NonNullable<SpeechData["claim"]>, log: Parameters<EventRenderer>[1]): string {
  const role = claim.role.charAt(0).toUpperCase() + claim.role.slice(1);
  const results = claim.results.map((r) => `${seatLabel(r.seat, log)} is ${r.side}`).join(", ");
  return `Claims ${role}${results ? `: ${results}` : ""}`;
}

export const dayEvents: Record<string, EventRenderer> = {
  speech: (d, log) => {
    const s = d as SpeechData;
    const who = `[Day ${s.cycle} ${roundLabel(s.round)}] ${seatLabel(s.seat, log)}`;
    if (s.skipped) return `${who} said nothing.`;
    const parts = [`${who}: “${s.text}”`];
    if (s.accuse.length) parts.push(`Accuses ${s.accuse.map((x) => seatLabel(x, log)).join(", ")}`);
    if (s.defend.length) parts.push(`Defends ${s.defend.map((x) => seatLabel(x, log)).join(", ")}`);
    if (s.claim) parts.push(claimText(s.claim, log));
    return parts.join(" · ");
  },
  replier_chosen: (d, log) =>
    `Day ${d.cycle} Right of Reply ${d.slot}: ${seatLabel(d.seat, log)} (accusation score ${d.score}` +
    `${(d.tied as number[]).length > 1 ? `, tie broken by the seed` : ""}).`,
  no_right_of_reply: (d) => `Day ${d.cycle}: nobody was accused, so no Right of Reply.`,
  votes_revealed: (d, log) =>
    `Day ${d.cycle} votes: ` +
    (d.votes as { seat: number; target: number | "abstain"; reason: string | null; timedOut: boolean }[])
      .map(
        (v) =>
          `${seatLabel(v.seat, log)} → ${v.target === "abstain" ? "Abstain" : seatLabel(v.target, log)}` +
          `${v.timedOut ? " (default)" : v.reason ? ` (“${v.reason}”)` : ""}`,
      )
      .join("; "),
  beliefs_recorded: (d, log) =>
    `Day ${d.cycle} beliefs (normalized P(werewolf)): ` +
    (d.ballots as { seat: number; beliefs: Record<string, number> }[])
      .map(
        (b) =>
          `${seatLabel(b.seat, log)}: ` +
          Object.entries(b.beliefs)
            .map(([seat, p]) => `${seat}=${p.toFixed(2)}`)
            .join(" "),
      )
      .join("; "),
  no_elimination: (d) => `Day ${d.cycle}: nobody eliminated (${d.reason === "tie" ? "tie" : "all abstained"}).`,
};
