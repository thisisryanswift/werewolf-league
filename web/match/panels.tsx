// God View and the Match view's pluggable panels.
//
// Convention: anything God-View-only either is an event whose audience is not
// "all" (filtered by the model), or is rendered inside <GodViewOnly>, or is a
// panel/seat slot registered below with godViewOnly: true. Panels never decide
// visibility themselves.
//
// To add a panel, import its component here and add one entry to MATCH_PANELS
// (a box under the seats or above the feed) or SEAT_SLOTS (a line in every seat
// row). Each receives the full event log (God-View-only events included) and
// the derived view.
import { createContext, useContext, type ReactNode } from "react";
import type { MatchEvent } from "../../src/shared/protocol";
import { TableSuspicion } from "../components/TableSuspicion";
import type { MatchView, SeatView } from "./model";

export const GodViewContext = createContext(true);

/** Whether God View is on for the Match view being rendered. */
export const useGodView = () => useContext(GodViewContext);

/** Renders its children only in God View. */
export function GodViewOnly({ children }: { children: ReactNode }) {
  return useGodView() ? <>{children}</> : null;
}

export interface MatchPanelProps {
  /** The full log, God-View-only events included; filter with visibleEvents() if needed. */
  events: MatchEvent[];
  view: MatchView;
}

export interface MatchPanel {
  id: string;
  /** Box heading; omit if the component has its own. */
  title?: string;
  godViewOnly: boolean;
  /** Under the seats (default) or above the feed. */
  placement?: "seats" | "feed";
  Component: (props: MatchPanelProps) => ReactNode;
}

export interface SeatSlot {
  id: string;
  godViewOnly: boolean;
  Component: (props: MatchPanelProps & { seat: SeatView }) => ReactNode;
}

/** Boxes shown under the seats or above the feed. */
export const MATCH_PANELS: MatchPanel[] = [
  // wl-bfo1. It reads ballots and roles, so it gets the full log and is God-View-only.
  { id: "table-suspicion", godViewOnly: true, placement: "seats", Component: ({ events }) => <TableSuspicion events={events} /> },
];

/** Extra lines inside each seat row (e.g. a Table Suspicion meter). */
export const SEAT_SLOTS: SeatSlot[] = [];
