// How Spectators see a seat: its Display Name with the Agent and copy label.
// Shared by the Match view and the League tiles. Players never see this.

/** The seat fields the label needs (a TileSeat, a SeatAgent or a match_setup seat). */
export interface LabelledSeat {
  /** Absent in Matches recorded before Display Names. */
  displayName?: string;
  /** Agent and copy label, e.g. "Hydrogen #2". */
  label: string;
}

/** "Mara · Hydrogen #2". */
export function spectatorLabel(seat: LabelledSeat): string {
  return seat.displayName ? `${seat.displayName} · ${seat.label}` : seat.label;
}
