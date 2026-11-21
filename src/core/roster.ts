// League configuration: the roster (Agents = model + Agent Instructions +
// harness) and scheduling settings. The operator replaces any of it through the
// admin config route; these are the defaults for a fresh League.

import { DEFAULT_RULESET_ID } from "../rulesets";
import type { AgentConfig } from "./harness";

/** The League every Match reports to (one League for the demo). */
export const LEAGUE_NAME = "default";

export interface LeagueConfig {
  /** Matches kept live at once. */
  n: number;
  /** While paused, running Matches finish but no new ones start. */
  paused: boolean;
  /** Seats per Match. */
  seats: number;
  rulesetId: string;
  rulesetConfig: Record<string, unknown>;
  /** Agents the League draws from. Copies may share a Match. */
  roster: AgentConfig[];
}

/** Scripted Agents that answer after a few polls: a local demo roster that never calls Gemini. */
export function fakeRoster(): AgentConfig[] {
  return ["Ada", "Bo", "Cy", "Di", "Ed", "Flo", "Gus"].map((name) => ({
    id: `fake-${name.toLowerCase()}`,
    name,
    harness: "fake",
    options: { script: "first-legal", delayPolls: 1 },
  }));
}

/** A fresh League starts paused, so it spends nothing until the operator resumes it. */
export function defaultLeagueConfig(): LeagueConfig {
  return { n: 6, paused: true, seats: 7, rulesetId: DEFAULT_RULESET_ID, rulesetConfig: {}, roster: fakeRoster() };
}

export const MAX_LIVE_MATCHES = 24;

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
