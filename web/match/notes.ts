// Agent notes (wl-rhpr): each Player's private /notes.md scratchpad, as its Agent last
// wrote it. notes_updated events are addressed to nobody, so they only exist in
// Narrator's View. Pure, so it is tested directly; SeatNotes.tsx renders it.
import type { MatchEvent } from "../../src/shared/protocol";
import { visibleEvents } from "./model";

export interface SeatNotes {
  text: string;
  truncated: boolean;
  /** The Day or Night it was written in, e.g. "Night 1". */
  when: string;
  seq: number;
}

/** Each seat's latest notes, from the events a Spectator may see. */
export function latestNotes(events: MatchEvent[], narratorView: boolean): Map<number, SeatNotes> {
  const out = new Map<number, SeatNotes>();
  let when = "Setup";
  for (const e of visibleEvents(events, narratorView)) {
    if (e.kind === "phase_started") when = `${e.data.phase === "night" ? "Night" : "Day"} ${String(e.data.cycle)}`;
    if (e.kind === "notes_updated" && typeof e.data.text === "string") {
      out.set(Number(e.data.seat), { text: e.data.text, truncated: !!e.data.truncated, when, seq: e.seq });
    }
  }
  return out;
}

/** The notes as written at one notes_updated event (wl-jz95); null for any other event. */
export function notesVersion(e: MatchEvent): { text: string; truncated: boolean } | null {
  if (e.kind !== "notes_updated" || typeof e.data.text !== "string") return null;
  return { text: e.data.text, truncated: !!e.data.truncated };
}
