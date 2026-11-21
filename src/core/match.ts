// Ruleset-agnostic Match types and pending-step bookkeeping shared by the
// Match DO, the Player DO and whoever starts Matches (admin route, League).

import type { AgentConfig, TurnInput } from "./harness";
import type { MatchResult, Seat, SeatAgent, ToolCall, TurnRequest } from "./ruleset";

/** Everything needed to start a Match. */
export interface MatchInit {
  matchId: string;
  rulesetId: string;
  seed: string;
  config: Record<string, unknown>;
  seats: SeatAgent[];
  /** The Agent playing each seat. */
  agents: Record<Seat, AgentConfig>;
}

export type MatchStatus = "running" | "finished";

export interface MatchSnapshot {
  matchId: string;
  rulesetId: string;
  status: MatchStatus;
  seats: SeatAgent[];
  result: MatchResult | null;
}

/** One Player's turn within a step. The observation is frozen when the step starts. */
export interface PendingTurn {
  turnId: string;
  seat: Seat;
  request: TurnRequest;
  input: TurnInput;
  /** Recorded outcome: a valid call, or null for the default. Undefined while in flight. */
  action?: ToolCall | null;
}

export interface PendingStep {
  stepNo: number;
  startedAt: number;
  turns: PendingTurn[];
}

export const stepComplete = (step: PendingStep): boolean => step.turns.every((t) => t.action !== undefined);

export const actionsOf = (step: PendingStep): Record<Seat, ToolCall | null> =>
  Object.fromEntries(step.turns.map((t) => [t.seat, t.action ?? null]));

/** What a Player DO is told to do. */
export interface TurnAssignment {
  matchId: string;
  turnId: string;
  seat: Seat;
  input: TurnInput;
}

/** The Match's answer when a Player reports an action. */
export type SubmitResult =
  | { status: "accepted" }
  | { status: "invalid"; error: string }
  /** The turn already resolved or belongs to an old step; drop it. */
  | { status: "stale" };
