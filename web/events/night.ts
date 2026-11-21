import { seatLabel, type EventRenderer } from "./types";

export const nightEvents: Record<string, EventRenderer> = {
  wolf_chat: (d, log) => `Wolf Chat (Night ${d.cycle}, ${d.exchange}) — ${seatLabel(d.seat, log)}: “${d.text}”`,
  kill_chosen: (d, log) => `${seatLabel(d.seat, log)} wants to kill ${seatLabel(d.target, log)}.`,
  kill_decided: (d, log) =>
    `Night ${d.cycle}: the Werewolves go for ${seatLabel(d.target, log)} (Pack Leader ${seatLabel(d.packLeader, log)}).`,
  seer_result: (d, log) =>
    `Seer ${seatLabel(d.seat, log)} inspects ${seatLabel(d.target, log)}: ${d.side === "wolf" ? "a Werewolf" : "Village side"}.`,
  protect_chosen: (d, log) => `Doctor ${seatLabel(d.seat, log)} protects ${seatLabel(d.target, log)}.`,
  doctor_saved: (d, log) => `The Doctor saved ${seatLabel(d.target, log)} from the Werewolves!`,
  night_passed: (d) => (d.killed === null ? `Night ${d.cycle}: nobody died.` : `Night ${d.cycle} is over.`),
};
