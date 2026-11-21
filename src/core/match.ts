// Ruleset-agnostic Match types and pending-step bookkeeping shared by the
// Match DO, the Player DO and whoever starts Matches (admin route, League).

import type { DeadlineConfig, TimeoutCounts, TimeoutSource } from "./deadlines";
import type { AgentConfig, TurnInput } from "./harness";
import type { NarratorConfig } from "./narrator";
import type { AnalystConfig } from "./analyst";
import type { MatchResult, Seat, SeatAgent, ToolCall, TurnRequest } from "./ruleset";
import type { MatchCost } from "../shared/protocol";

/** Everything needed to start a Match. */
export interface MatchInit {
  matchId: string;
  rulesetId: string;
  seed: string;
  config: Record<string, unknown>;
  seats: SeatAgent[];
  /** The Agent playing each seat. */
  agents: Record<Seat, AgentConfig>;
  /** Turn deadlines; missing values use DEFAULT_DEADLINES (60 s, first turn 90 s). */
  deadlines?: Partial<DeadlineConfig>;
  /** The Narrator for this Match; absent or null means no narration. */
  narrator?: NarratorConfig | null;
  /** The post-Match Analyst; absent or null means no analysis. */
  analyst?: AnalystConfig | null;
  /** The League DO (by name) the Match reports to; absent means LEAGUE_NAME. */
  league?: string;
  /** Match Number given by the League that started it; absent for a one-off Match. */
  matchNumber?: number;
}

export type MatchStatus = "running" | "finished";

export interface MatchSnapshot {
  matchId: string;
  matchNumber?: number;
  rulesetId: string;
  status: MatchStatus;
  seats: SeatAgent[];
  result: MatchReport | null;
  stats: MatchStats;
}

/** Live Match statistics kept by the runner. */
export interface MatchStats {
  timeouts: TimeoutCounts;
  /** Measured USD spent so far (the per-Player breakdown is only published once the Match is over). */
  cost: number;
}

/** The Ruleset's result plus the runner's per-Player and per-Agent timeout counts. Sent to the League. */
export interface MatchReport extends MatchResult {
  timeouts: TimeoutCounts;
  /** Measured cost; absent on results reported before cost tracking. */
  cost?: MatchCost;
}

/** One Player's turn within a step. The observation is frozen when the step starts. */
export interface PendingTurn {
  turnId: string;
  seat: Seat;
  request: TurnRequest;
  input: TurnInput;
  /** Recorded outcome: a valid call, or null for the default. Undefined while in flight. */
  action?: ToolCall | null;
  /** Set when the turn missed its deadline (its action is then null). */
  timedOut?: TimeoutSource;
  /** Absolute deadline (epoch ms) and its length. */
  deadlineAt: number;
  deadlineMs: number;
  /** Highest seq included in this turn's observation; becomes the seat's lastSeen only if it answered. */
  seenThrough: number;
  /** True once the Player DO has accepted the assignment. */
  dispatched?: boolean;
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
  /** Absolute deadline (epoch ms). The Player cancels the turn and reports a timeout once it passes. */
  deadlineAt: number;
}

/** The Match's answer when a Player reports an action. */
export type SubmitResult =
  | { status: "accepted" }
  | { status: "invalid"; error: string }
  /** The turn already resolved or belongs to an old step; drop it. */
  | { status: "stale" };
