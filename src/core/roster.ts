// League configuration: the roster (Agents = model + Agent Instructions +
// harness) and scheduling settings. The operator replaces any of it through the
// admin config route; these are the defaults for a fresh League.

import { DEFAULT_RULESET_ID, LEAGUE_SEED_ROSTERS } from "../rulesets";
import type { DeadlineConfig } from "./deadlines";
import type { AgentConfig } from "./harness";
import type { NarratorConfig } from "./narrator";
import { narratorConfigError } from "../narrator";
import { analystConfigError, type AnalystConfig } from "./analyst";

export interface LeagueConfig {
  /** Matches kept live at once. */
  n: number;
  /** While paused, running Matches finish but no new ones start. */
  paused: boolean;
  /** Seats per Match. */
  seats: number;
  rulesetId: string;
  rulesetConfig: Record<string, unknown>;
  /** Turn deadlines for new Matches; missing values use the defaults (60 s, first turn 90 s). */
  deadlines?: Partial<DeadlineConfig>;
  /** The Narrator for new Matches (e.g. { id: "decisions" }); absent or null means none. */
  narrator?: NarratorConfig | null;
  /** The post-Match Analyst for new Matches (e.g. { harness: "managed-agent", model: "gemini-4-neon" }); absent or null means none. */
  analyst?: AnalystConfig | null;
  /** At most this many Analyst runs are in flight at once in this League; more wait. Default 4. */
  analystConcurrency?: number;
  /** Agents the League draws from. Copies may share a Match. */
  roster: AgentConfig[];
  /** At most this many new Matches start in any `startWindowMs` window. */
  startsPerWindow: number;
  startWindowMs: number;
  /** After a Player reports a 429, no new Matches start for this long. */
  backoffMs: number;
  /** Minimum time between League feed messages. */
  feedIntervalMs: number;
  /**
   * Match seeds to use for the next Matches, in order, before random ones.
   * Lets the operator (or a test) replay or script a specific table.
   */
  seeds?: string[];
  /** Agent ids left off the displayed leaderboard (their ratings and history are kept). */
  hiddenAgents?: string[];
  /** Total League spend (USD) at which the League pauses itself; absent or null for no cap. */
  spendCap?: number | null;
}

/** Scheduling and feed defaults (spec wl-xgp7, "Scale and League feed"). */
export const DEFAULT_PACING = { startsPerWindow: 4, startWindowMs: 30_000, backoffMs: 60_000, feedIntervalMs: 500 };

/** Scripted Agents that answer after a few polls: a local demo roster that never calls Gemini. */
export function fakeRoster(): AgentConfig[] {
  return ["Ada", "Bo", "Cy", "Di", "Ed", "Flo", "Gus"].map((name) => ({
    id: `fake-${name.toLowerCase()}`,
    name,
    harness: "fake",
    options: { script: "first-legal", delayPolls: 1 },
  }));
}

/**
 * A fresh League starts paused, so it spends nothing until the operator resumes
 * it. A League with a seed roster (pi-open: the pi Harness Agents) starts on it;
 * others start on the fake roster.
 */
export function defaultLeagueConfig(leagueId?: string): LeagueConfig {
  const seed = leagueId === undefined ? undefined : LEAGUE_SEED_ROSTERS[leagueId];
  return {
    n: 24,
    paused: true,
    seats: 7,
    rulesetId: DEFAULT_RULESET_ID,
    rulesetConfig: {},
    roster: seed ? seed() : fakeRoster(),
    ...DEFAULT_PACING,
  };
}

export const MAX_LIVE_MATCHES = 36;

const isAgent = (a: unknown): a is AgentConfig => {
  const x = a as Record<string, unknown>;
  return (
    typeof x === "object" &&
    x !== null &&
    typeof x.id === "string" &&
    x.id.length > 0 &&
    typeof x.name === "string" &&
    typeof x.harness === "string"
  );
};

/** Apply an operator's partial config, or explain why it is invalid. */
export function patchConfig(
  current: LeagueConfig,
  patch: Record<string, unknown>,
): { ok: true; config: LeagueConfig } | { ok: false; error: string } {
  const next = { ...current };
  if (patch.n !== undefined) {
    if (!Number.isInteger(patch.n) || (patch.n as number) < 0 || (patch.n as number) > MAX_LIVE_MATCHES) {
      return { ok: false, error: `n must be an integer from 0 to ${MAX_LIVE_MATCHES}` };
    }
    next.n = patch.n as number;
  }
  for (const [key, min] of [["startsPerWindow", 1], ["startWindowMs", 0], ["backoffMs", 0], ["feedIntervalMs", 0]] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    if (!Number.isInteger(v) || (v as number) < min) return { ok: false, error: `${key} must be an integer of at least ${min}` };
    next[key] = v as number;
  }
  if (patch.seats !== undefined) {
    if (!Number.isInteger(patch.seats) || (patch.seats as number) < 2 || (patch.seats as number) > 16) {
      return { ok: false, error: "seats must be an integer from 2 to 16" };
    }
    next.seats = patch.seats as number;
  }
  if (patch.rulesetConfig !== undefined) {
    if (typeof patch.rulesetConfig !== "object" || patch.rulesetConfig === null) {
      return { ok: false, error: "rulesetConfig must be an object" };
    }
    next.rulesetConfig = patch.rulesetConfig as Record<string, unknown>;
  }
  if (patch.deadlines !== undefined) {
    const d = patch.deadlines as Record<string, unknown> | null;
    const keys = ["turnMs", "firstTurnMs", "graceMs"];
    const valid =
      typeof d === "object" &&
      d !== null &&
      Object.entries(d).every(([k, v]) => keys.includes(k) && typeof v === "number" && Number.isFinite(v) && v > 0);
    if (!valid) return { ok: false, error: "deadlines must be { turnMs?, firstTurnMs?, graceMs? } with positive numbers" };
    next.deadlines = d as Partial<DeadlineConfig>;
  }
  if (patch.narrator !== undefined) {
    const error = patch.narrator === null ? null : narratorConfigError(patch.narrator);
    if (error) return { ok: false, error };
    next.narrator = patch.narrator as NarratorConfig | null;
  }
  if (patch.analyst !== undefined) {
    const error = patch.analyst === null ? null : analystConfigError(patch.analyst);
    if (error) return { ok: false, error };
    next.analyst = patch.analyst as AnalystConfig | null;
  }
  if (patch.analystConcurrency !== undefined) {
    const v = patch.analystConcurrency;
    if (!Number.isInteger(v) || (v as number) < 1) return { ok: false, error: "analystConcurrency must be an integer of at least 1" };
    next.analystConcurrency = v as number;
  }
  if (patch.seeds !== undefined) {
    if (!Array.isArray(patch.seeds) || !patch.seeds.every((x) => typeof x === "string" && x.length > 0 && x.length <= 128)) {
      return { ok: false, error: "seeds must be a list of non-empty strings (at most 128 characters)" };
    }
    next.seeds = patch.seeds as string[];
  }
  if (patch.hiddenAgents !== undefined) {
    if (!Array.isArray(patch.hiddenAgents) || !patch.hiddenAgents.every((x) => typeof x === "string" && x.length > 0 && x.length <= 128)) {
      return { ok: false, error: "hiddenAgents must be a list of Agent ids" };
    }
    next.hiddenAgents = patch.hiddenAgents as string[];
  }
  if (patch.spendCap !== undefined) {
    const cap = patch.spendCap;
    if (cap !== null && !(typeof cap === "number" && Number.isFinite(cap) && cap >= 0)) {
      return { ok: false, error: "spendCap must be null or a non-negative number of USD" };
    }
    next.spendCap = cap as number | null;
  }
  if (patch.roster !== undefined) {
    if (!Array.isArray(patch.roster) || !patch.roster.every(isAgent)) {
      return { ok: false, error: "roster must be a list of Agents with id, name and harness" };
    }
    const distinct = new Set(patch.roster.map((a) => a.id)).size;
    if (distinct < 2) return { ok: false, error: `The roster needs at least 2 Agents, but has ${distinct}` };
    next.roster = patch.roster;
  }
  return { ok: true, config: next };
}
