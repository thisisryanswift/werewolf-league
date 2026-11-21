// Turn deadlines, timeouts and the Match runner's own events (ruleset-agnostic).
//
// Each turn gets an absolute deadline when its step is dispatched. The Player DO
// enforces it (cancels the Harness turn and reports a timeout); the Match DO's
// backstop expires any turn still unreported at deadline + grace. Either way the
// turn's action is `null`, which the Ruleset resolves as its default.

import type { RulesetEvent } from "../shared/protocol";
import type { TimeoutSource } from "../shared/turn-events";
import type { PendingStep, PendingTurn } from "./match";

export { countTimeouts, isRunnerEvent, type TimeoutCounts, type TimeoutSource } from "../shared/turn-events";

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

// ---- runner events (see src/shared/turn-events.ts) -----------------------

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
