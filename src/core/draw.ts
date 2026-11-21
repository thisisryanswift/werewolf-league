// Draw a Match table from the roster. Pure and deterministic: every draw comes
// from the recorded match seed plus an attempt number, so the same seed and
// roster always give the same table (including any redraws).

import type { AgentConfig } from "./harness";
import { rngFrom } from "./rng";
import type { SeatAgent } from "./ruleset";
import { labelSeats } from "./start-match";

/** How many times the League redraws a table the Ruleset rejects before giving up. */
export const MAX_DRAW_ATTEMPTS = 20;

export type DrawResult =
  | { ok: true; agents: AgentConfig[]; seats: SeatAgent[]; attempt: number }
  | { ok: false; error: string };

export interface DrawOptions {
  roster: AgentConfig[];
  seats: number;
  seed: string;
  /** The Ruleset's verdict on a drawn table: null if it can deal it, else its setup error. */
  check: (seats: SeatAgent[]) => string | null;
  /** Give each Agent at most one seat when the roster covers the table; copies only fill seats beyond the roster. */
  uniqueAgents?: boolean;
}

/** Distinct Agents of a roster, by id (first entry wins). */
export function distinctAgents(roster: AgentConfig[]): AgentConfig[] {
  const byId = new Map<string, AgentConfig>();
  for (const a of roster) if (!byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()];
}

/**
 * Draw `seats` Agents at random from the roster (copies allowed), always with at
 * least 2 distinct Agents. If the Ruleset rejects the table, redraw with the next
 * attempt number. Refuses rosters of fewer than 2 distinct Agents.
 */
export function drawTable({ roster, seats, seed, check, uniqueAgents }: DrawOptions): DrawResult {
  const pool = distinctAgents(roster);
  if (pool.length < 2) return { ok: false, error: `The roster needs at least 2 Agents, but has ${pool.length}` };
  if (seats < 2) return { ok: false, error: `A table needs at least 2 seats, got ${seats}` };
  let lastError = "";
  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
    const rng = rngFrom(`${seed}:draw:${attempt}`);
    const agents = uniqueAgents
      ? rng.shuffle([
          ...rng.shuffle(pool).slice(0, seats),
          ...Array.from({ length: Math.max(0, seats - pool.length) }, () => pool[rng.int(pool.length)]!),
        ])
      : Array.from({ length: seats }, () => pool[rng.int(pool.length)]!);
    if (agents.every((a) => a.id === agents[0]!.id)) {
      // Guarantee 2 distinct Agents: swap one seat to another Agent.
      const others = pool.filter((a) => a.id !== agents[0]!.id);
      agents[rng.int(seats)] = others[rng.int(others.length)]!;
    }
    const labelled = labelSeats(agents, seed);
    const error = check(labelled);
    if (error === null) return { ok: true, agents, seats: labelled, attempt };
    lastError = error;
  }
  return { ok: false, error: `No dealable table after ${MAX_DRAW_ATTEMPTS} draws: ${lastError}` };
}
