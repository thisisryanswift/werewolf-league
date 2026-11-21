import { seatLabel, type EventRenderer } from "./types";

export const commonEvents: Record<string, EventRenderer> = {
  match_setup: (d) => `Match set up with ${(d.seats as unknown[]).length} seats.`,
  role_assigned: (d, log) => `${seatLabel(d.seat, log)} is a ${d.role}.`,
  wolf_team: (d, log) => `Werewolves: ${(d.wolves as number[]).map((s) => seatLabel(s, log)).join(" and ")}.`,
  phase_started: (d) => `${d.phase === "night" ? "Night" : "Day"} ${d.cycle} begins.`,
  player_died: (d, log) =>
    `${seatLabel(d.seat, log)} ${d.cause === "vote" ? "was voted out" : "was killed in the Night"} and was a ${d.role}.`,
  match_over: (d) => `Match over: ${d.winner === "wolf" ? "Werewolves" : "Village"} win (${d.reason}).`,
};
