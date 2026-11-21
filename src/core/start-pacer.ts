// Start pacing for the League: at most `startsPerWindow` new Matches in any
// sliding `startWindowMs` window, and none during a 429 backoff. Pure: the
// caller passes the clock, so tests can drive time.

export interface Pacing {
  startsPerWindow: number;
  startWindowMs: number;
}

export interface StartBudget {
  /** Matches that may start now. */
  allowed: number;
  /** When `allowed` is 0: the earliest time a start may happen. */
  nextAt: number | null;
}

/** Start times still inside the window ending at `now`, oldest first. Times after `now` (a clock set back) are dropped. */
export function recentStarts(starts: number[], now: number, pacing: Pacing): number[] {
  return starts.filter((t) => t > now - pacing.startWindowMs && t <= now).sort((a, b) => a - b);
}

/** How many Matches may start at `now`, given earlier start times and the backoff end. */
export function startBudget(starts: number[], now: number, pacing: Pacing, backoffUntil: number): StartBudget {
  if (now < backoffUntil) return { allowed: 0, nextAt: backoffUntil };
  const recent = recentStarts(starts, now, pacing);
  const allowed = Math.max(0, pacing.startsPerWindow - recent.length);
  if (allowed > 0) return { allowed, nextAt: null };
  // One slot frees when all but (limit - 1) of the recent starts have left the window.
  const pivot = recent[recent.length - pacing.startsPerWindow] ?? recent[0] ?? now;
  return { allowed: 0, nextAt: pivot + pacing.startWindowMs };
}

/** The backoff end after a 429 at `now`: extended, never shortened. */
export function backoffUntil(current: number, now: number, backoffMs: number): number {
  return Math.max(current, now + backoffMs);
}
