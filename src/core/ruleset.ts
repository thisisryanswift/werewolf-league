// The Ruleset interface. League, Match, Player and the spectator plumbing depend
// only on this file (plus the registry); every game rule lives behind it.
// A Ruleset is pure: all randomness comes from the match seed.

import type { EventAudience, MatchSummary, RulesetEvent } from "../shared/protocol";

export type { MatchSummary };

export type Seat = number; // 1-based seat number

/** One seat of a Match, as drawn by whoever starts the Match. */
export interface SeatAgent {
  seat: Seat;
  agentId: string;
  /** Display label, e.g. "Hydrogen #2". */
  label: string;
}

/** A tool the Agent can call (ADR-0002: fixed per seat for the whole Match). */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

/** A custom function call returned by an Agent. */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** What one Player must do in the current step. */
export interface TurnRequest {
  seat: Seat;
  /** The tool the Player is required to call, e.g. "vote". */
  actionKind: string;
  /** Legal targets for the required action, if it takes a target. */
  legalTargets: (Seat | string)[];
  /** Human/agent-readable statement of the required action. */
  prompt: string;
}

export type Step =
  | { type: "turns"; turns: TurnRequest[] }
  | { type: "finished"; result: MatchResult };

export interface MatchResult {
  winner: string; // winning Side
  /** Side of every Player, by seat. */
  sides: Record<Seat, string>;
  /** Normalized belief ballots, for Rulesets that collect them (Calibration, Table Suspicion). */
  ballots?: BeliefBallot[];
  /** The Side the ballots guess at. Ballots from Players on other Sides are scored for Calibration. */
  beliefSide?: string;
}

/**
 * One Player's stated, normalized beliefs at one decision point: for each other
 * seat, the probability that it belongs to the Side being guessed at.
 */
export interface BeliefBallot {
  /** The voter. */
  seat: Seat;
  /** Ruleset-defined round number (e.g. the Day). */
  round: number;
  beliefs: Record<Seat, number>;
}

export type SetupResult<S> =
  | {
      ok: true;
      state: S;
      events: RulesetEvent[];
      /** Fixed tool list per seat for the whole Match (never empty). */
      tools: Record<Seat, ToolSpec[]>;
    }
  | { ok: false; error: string };

export type Validation = { ok: true } | { ok: false; error: string };

/**
 * What a Player sees: either one seat, or a Spectator (God View sees every
 * audience). Spectator feeds send the God View and filter client-side.
 */
export type Viewer = { seat: Seat } | { spectator: true; godView: boolean };

export interface Ruleset<S = unknown> {
  id: string;
  /** The Sides a Player can be on, in display order. Each Agent holds one Side Rating per Side. */
  sides: readonly string[];
  setup(config: Record<string, unknown>, seed: string, seats: SeatAgent[]): SetupResult<S>;
  /** Which Players must act now, or the final result. */
  nextStep(state: S): Step;
  /** Check one call against the current step; the error names the required action. */
  validate(state: S, seat: Seat, call: ToolCall): Validation;
  /**
   * Resolve the current step. Every Player in the step appears in `actions`;
   * `null` means "no valid action" (timeout, or no call) and gets the default.
   */
  applyActions(state: S, actions: Record<Seat, ToolCall | null>): { state: S; events: RulesetEvent[] };
  /** Filter events to those a viewer may see. */
  view<E extends { audience: EventAudience }>(events: E[], viewer: Viewer): E[];
  /** The rules text given to a Player on its first turn. */
  briefing(state: S, seat: Seat): string;
  /** Render a frozen observation: new events since the Player's last turn plus its turn request. */
  renderObservation(state: S, seat: Seat, newEvents: RulesetEvent[], turn: TurnRequest): string;
  result(state: S): MatchResult | null;
  /**
   * Public summary for the League grid tile. `publicEvents` is the committed
   * log filtered to the "all" audience (for the latest speech line).
   */
  summary(state: S, publicEvents: RulesetEvent[]): MatchSummary;
}

/** Default `view` for rulesets that use the shared audience field. */
export function viewByAudience<E extends { audience: EventAudience }>(events: E[], viewer: Viewer): E[] {
  if ("spectator" in viewer) {
    return viewer.godView ? events : events.filter((e) => e.audience === "all");
  }
  return events.filter((e) => e.audience === "all" || e.audience.includes(viewer.seat));
}
