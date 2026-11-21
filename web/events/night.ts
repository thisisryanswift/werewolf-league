import { seatLabel, type EventRenderer } from "./types";

export const nightEvents: Record<string, EventRenderer> = {
  kill_chosen: (d, log) => `${seatLabel(d.seat, log)} wants to kill ${seatLabel(d.target, log)}.`,
  night_passed: (d) => (d.killed === null ? `Night ${d.cycle}: nobody died.` : `Night ${d.cycle} is over.`),
};
