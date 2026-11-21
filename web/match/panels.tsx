// God View and the Match view's pluggable panels.
//
// Convention: anything God-View-only either is an event whose audience is not
// "all" (filtered by the model), or is rendered inside <GodViewOnly>, or is a
// panel/seat slot registered below with godViewOnly: true. Panels never decide
// visibility themselves.
//
// To add a panel (e.g. wl-bfo1's Table Suspicion), import its component here and
// add one entry to MATCH_PANELS (a box above the feed) or SEAT_SLOTS (a line in
// every seat row). Each receives the full event log and the derived view.
import { createContext, useContext, type ReactNode } from "react";
import type { MatchEvent } from "../../src/shared/protocol";
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
  title: string;
  godViewOnly: boolean;
  Component: (props: MatchPanelProps) => ReactNode;
}

export interface SeatSlot {
  id: string;
  godViewOnly: boolean;
  Component: (props: MatchPanelProps & { seat: SeatView }) => ReactNode;
}

/** Boxes shown above the feed. */
export const MATCH_PANELS: MatchPanel[] = [];

/** Extra lines inside each seat row (e.g. a Table Suspicion meter). */
export const SEAT_SLOTS: SeatSlot[] = [];
