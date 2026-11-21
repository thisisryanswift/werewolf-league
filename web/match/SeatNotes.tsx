// The seat row's Agent notes drawer (wl-rhpr). Registered in SEAT_SLOTS as Narrator's-View-only.
import type { MatchEvent } from "../../src/shared/protocol";
import type { SeatView } from "./model";
import { latestNotes } from "./notes";

/** Closed by default, so the seat list stays compact. */
export function SeatNotesDrawer({ events, seat }: { events: MatchEvent[]; seat: SeatView }) {
  const notes = latestNotes(events, true).get(seat.seat);
  if (!notes) return null;
  return (
    <details className="mv-notes" data-testid="notes" data-seat-notes={seat.seat}>
      <summary>
        📝 Notes · {notes.when}
        {notes.truncated ? " (cut)" : ""}
      </summary>
      <pre>{notes.text}</pre>
    </details>
  );
}
