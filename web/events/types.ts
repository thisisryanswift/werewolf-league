import type { MatchEvent } from "../../src/shared/protocol";

export type EventRenderer = (data: Record<string, any>, log: MatchEvent[]) => string;

/** "Seat 3 (Hydrogen #2)", using labels from the match_setup event. */
export function seatLabel(seat: unknown, log: MatchEvent[]): string {
  const setup = log.find((e) => e.kind === "match_setup");
  const seats = (setup?.data.seats ?? []) as { seat: number; label: string }[];
  const s = seats.find((x) => x.seat === Number(seat));
  return s ? `Seat ${s.seat} (${s.label})` : `Seat ${String(seat)}`;
}
