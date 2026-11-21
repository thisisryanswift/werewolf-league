// The post-Match Analyst's report and its `analysis` event data (wl-ofdn), shared by
// the Match runner (src/core/analyst.ts) and the Match view.
//
//   analysis  AnalysisEventData  audience []  committed once per analysed Match, after
//             match_over and the result's settlement. Narrator's View only: it discusses roles.

export interface AnalysisReport {
  summary: string;
  turning_points: { when: string; what: string }[];
  mistakes: { seat: number; agent: string; what: string; evidence: string }[];
  best_play: { seat: number; why: string };
  why_winner_won: string;
}

/** Why an analysis was recorded as failed (and skipped). */
export type AnalysisFailure = "timeout" | "no_report" | "provision_failed" | "no_slot" | "spend_cap";

export type AnalysisEventData =
  | { status: "ok"; model: string; startedAt: number; finishedAt: number; report: AnalysisReport }
  | { status: "failed"; model: string; startedAt: number | null; finishedAt: number; reason: AnalysisFailure; detail?: string };
