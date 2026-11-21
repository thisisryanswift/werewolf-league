// Turn deadlines, timeouts and the Match runner's own events (ruleset-agnostic).
//
// Each turn gets an absolute deadline when its step is dispatched. The Player DO
// enforces it (cancels the Harness turn and reports a timeout); the Match DO's
// backstop expires any turn still unreported at deadline + grace. Either way the
// turn's action is `null`, which the Ruleset resolves as its default.

import type { PendingStep, PendingTurn } from "./match";
import type { Seat, SeatAgent } from "./ruleset";
import type { MatchEvent, RulesetEvent } from "../shared/protocol";

export interface DeadlineConfig {
  /** Deadline for a normal turn. */
  turnMs: number;
  /** Deadline for a Player's first turn (briefing + first observation). */
  firstTurnMs: number;
  /** How long past a deadline the Match waits for a Player DO before its backstop expires the turn. */
  graceMs: number;
}

export const DEFAULT_DEADLINES: DeadlineConfig = { turnMs: 60_000, firstTurnMs: 90_000, graceMs: 15_000 };

/** Fill in defaults, ignoring anything that isn't a positive number. */
export function resolveDeadlines(partial: Partial<DeadlineConfig> | undefined): DeadlineConfig {
  const pick = (k: keyof DeadlineConfig) => {
    const v = partial?.[k];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : DEFAULT_DEADLINES[k];
  };
  return { turnMs: pick("turnMs"), firstTurnMs: pick("firstTurnMs"), graceMs: pick("graceMs") };
}

export const turnDuration = (cfg: DeadlineConfig, firstTurn: boolean): number =>
  firstTurn ? cfg.firstTurnMs : cfg.turnMs;

/** Who noticed the missed deadline. */
export type TimeoutSource = "player" | "backstop";

/** How long (ms from now) a Player DO should sleep before its next poll. */
export const nextPollDelay = (now: number, pollMs: number, deadlineAt: number): number =>
  Math.max(0, Math.min(pollMs, deadlineAt - now));

/** Mark every unresolved turn whose backstop time has passed as a timeout. Returns true if any changed. */
export function expireOverdue(step: PendingStep, now: number, graceMs: number): boolean {
  let changed = false;
  for (const t of step.turns) {
    if (t.action === undefined && now >= t.deadlineAt + graceMs) {
      t.action = null;
      t.timedOut = "backstop";
      changed = true;
    }
  }
  return changed;
}

/** When the Match must next wake for this step: now if done or a dispatch failed, else the earliest backstop. */
export function nextMatchWake(step: PendingStep, now: number, graceMs: number, retryMs: number): number {
  const open = step.turns.filter((t) => t.action === undefined);
  if (open.length === 0) return now;
  const backstop = Math.min(...open.map((t) => t.deadlineAt + graceMs));
  return open.some((t) => !t.dispatched) ? Math.min(now + retryMs, backstop) : backstop;
}

// ---- runner events ----------------------------------------------------
// The Match runner adds these to the event log alongside the Ruleset's events.
// Per-seat events are private to that seat (God View sees them), so a night-only
// role is never revealed by who is taking a turn. They are never shown to Agents.

export const RUNNER_EVENT_KINDS = new Set(["turn_started", "turn_timed_out", "step_resolved"]);

export const isRunnerEvent = (e: { kind: string }): boolean => RUNNER_EVENT_KINDS.has(e.kind);

export function turnStartedEvents(step: PendingStep): RulesetEvent[] {
  return step.turns.map((t) => ({
    kind: "turn_started",
    audience: [t.seat],
    data: { step: step.stepNo, seat: t.seat, actionKind: t.request.actionKind, deadlineMs: t.deadlineMs },
  }));
}

/** Committed when a step resolves, before the Ruleset's events: timeouts in seat order, then the step marker. */
export function stepResolvedEvents(step: PendingStep): RulesetEvent[] {
  const timeouts = [...step.turns]
    .filter((t): t is PendingTurn & { timedOut: TimeoutSource } => !!t.timedOut)
    .sort((a, b) => a.seat - b.seat)
    .map((t) => ({
      kind: "turn_timed_out",
      audience: [t.seat],
      data: { step: step.stepNo, seat: t.seat, actionKind: t.request.actionKind, by: t.timedOut },
    }));
  return [...timeouts, { kind: "step_resolved", audience: "all", data: { step: step.stepNo } }];
}

// ---- timeout counts -----------------------------------------------------

export interface TimeoutCounts {
  bySeat: Record<Seat, number>;
  byAgent: Record<string, number>;
}

/** Count timeouts per Player (seat) and per Agent from the event log. Every seat and Agent appears, zeros included. */
export function countTimeouts(events: Pick<MatchEvent, "kind" | "data">[], seats: SeatAgent[]): TimeoutCounts {
  const bySeat: Record<Seat, number> = {};
  const byAgent: Record<string, number> = {};
  for (const s of seats) {
    bySeat[s.seat] = 0;
    byAgent[s.agentId] = 0;
  }
  for (const e of events) {
    if (e.kind !== "turn_timed_out") continue;
    const seat = Number(e.data.seat);
    const agent = seats.find((s) => s.seat === seat)?.agentId;
    bySeat[seat] = (bySeat[seat] ?? 0) + 1;
    if (agent !== undefined) byAgent[agent] = (byAgent[agent] ?? 0) + 1;
  }
  return { bySeat, byAgent };
}
