// Narrator's View and the Match view's pluggable panels.
//
// Convention: anything Narrator's-View-only either is an event whose audience is not
// "all" (filtered by the model), or is rendered inside <NarratorViewOnly>, or is a
// panel/seat slot registered below with narratorViewOnly: true. Panels never decide
// visibility themselves.
//
// To add a panel, import its component here and add one entry to MATCH_PANELS
// (a box under the seats or above the feed) or SEAT_SLOTS (a line in every seat
// row). Each receives the full event log (Narrator's-View-only events included) and
// the derived view.
import { createContext, useContext, type ReactNode } from "react";
import type { MatchEvent } from "../../src/shared/protocol";
import { TableSuspicion } from "../components/TableSuspicion";
import type { MatchView, SeatView } from "./model";

export const NarratorViewContext = createContext(true);

/** Whether Narrator's View is on for the Match view being rendered. */
export const useNarratorView = () => useContext(NarratorViewContext);

/** Renders its children only in Narrator's View. */
export function NarratorViewOnly({ children }: { children: ReactNode }) {
  return useNarratorView() ? <>{children}</> : null;
}

export interface MatchPanelProps {
  /** The full log, Narrator's-View-only events included; filter with visibleEvents() if needed. */
  events: MatchEvent[];
  view: MatchView;
}

export interface MatchPanel {
  id: string;
  /** Box heading; omit if the component has its own. */
  title?: string;
  narratorViewOnly: boolean;
  /** Under the seats (default) or above the feed. */
  placement?: "seats" | "feed";
  Component: (props: MatchPanelProps) => ReactNode;
}

export interface SeatSlot {
  id: string;
  narratorViewOnly: boolean;
  Component: (props: MatchPanelProps & { seat: SeatView }) => ReactNode;
}

/** Boxes shown under the seats or above the feed. */
export const MATCH_PANELS: MatchPanel[] = [
  // wl-bfo1. It reads ballots and roles, so it gets the full log and is Narrator's-View-only.
  { id: "table-suspicion", narratorViewOnly: true, placement: "seats", Component: ({ events }) => <TableSuspicion events={events} /> },
];

/** Extra lines inside each seat row (e.g. a Table Suspicion meter). */
export const SEAT_SLOTS: SeatSlot[] = [];
