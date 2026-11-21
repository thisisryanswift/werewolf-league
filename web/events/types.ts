import type { MatchEvent } from "../../src/shared/protocol";
import { spectatorLabel, type LabelledSeat } from "../../src/shared/seat-label";

export type EventRenderer = (data: Record<string, any>, log: MatchEvent[]) => string;

/** Display names of Werewolf roles (the Ruleset's ROLE_NAMES; web code may not import the Ruleset). */
const ROLE_NAMES: Record<string, string> = { werewolf: "Werewolf", seer: "Seer", doctor: "Doctor", villager: "Villager" };

/** "Werewolf" for "werewolf"; an unknown role id is shown as is. */
export function roleName(role: unknown): string {
  return ROLE_NAMES[String(role)] ?? String(role);
}

/** Seats as recorded in the match_setup event. */
export function setupSeats(log: MatchEvent[]): (LabelledSeat & { seat: number; agentId: string })[] {
  const setup = log.find((e) => e.kind === "match_setup");
  return (setup?.data.seats ?? []) as (LabelledSeat & { seat: number; agentId: string })[];
}

/** "Seat 3 (Mara · Hydrogen #2)", using the seats from the match_setup event. */
export function seatLabel(seat: unknown, log: MatchEvent[]): string {
  const s = setupSeats(log).find((x) => x.seat === Number(seat));
  return s ? `Seat ${s.seat} (${spectatorLabel(s)})` : `Seat ${String(seat)}`;
}
