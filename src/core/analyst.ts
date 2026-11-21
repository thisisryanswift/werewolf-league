// The Analyst (wl-ofdn): after a Match's result is settled, a Managed Agent reads the
// whole Match (Narrator's View) and files one report through the fixed function tool
// submit_report. It runs on a seat-less Player DO with a long deadline, so it reuses the
// Harness polling, deadline and timeout machinery. It never affects play, ratings,
// Calibration or the Narrator: it starts only after the League has acknowledged the
// result, and a failed or timed-out run is recorded and skipped.
// Ruleset-agnostic: the instructions and the input text come from the Ruleset's
// `analysis` hook.

import type { AgentConfig } from "./harness";
import type { Seat, ToolCall, ToolSpec, Validation } from "./ruleset";
import type { RulesetEvent } from "../shared/protocol";
import type { AnalysisEventData, AnalysisReport } from "../shared/analysis";

export type { AnalysisEventData, AnalysisFailure, AnalysisReport } from "../shared/analysis";

/** The Analyst's Player DO is seat 0 of its Match (`${matchId}:0`); real seats start at 1. */
export const ANALYST_SEAT = 0;

export const DEFAULT_ANALYST_DEADLINE_MS = 5 * 60_000;
/** A Match waiting this long for an Analyst slot gives up and records the analysis as skipped. */
export const DEFAULT_ANALYST_MAX_WAIT_MS = 20 * 60_000;
export const DEFAULT_ANALYST_CONCURRENCY = 4;
export const DEFAULT_ANALYST_MODEL = "gemini-4-neon";
/** Analysis input is a whole Match plus a long instructions file; Neon thinks a lot. */
export const DEFAULT_ANALYST_MAX_TOTAL_TOKENS = 200_000;

/**
 * Per-Match Analyst choice (JSON: travels in MatchInit and League config).
 * Absent or null means no analysis. E.g. { harness: "managed-agent", model: "gemini-4-neon" }.
 */
export interface AnalystConfig {
  harness: string;
  /** Default gemini-4-neon. */
  model?: string;
  /** Harness options (e.g. a Fake Harness script, or maxTotalTokens). */
  options?: Record<string, unknown>;
  /** The run's deadline. Default 5 min. */
  deadlineMs?: number;
  /** Longest wait for a League Analyst slot before the analysis is skipped. Default 20 min. */
  maxWaitMs?: number;
}

/** The AgentConfig the Analyst's Player DO runs. */
export function analystAgent(c: AnalystConfig): AgentConfig {
  return {
    id: "analyst",
    name: "Analyst",
    harness: c.harness,
    model: c.model ?? DEFAULT_ANALYST_MODEL,
    options: { maxTotalTokens: DEFAULT_ANALYST_MAX_TOTAL_TOKENS, ...c.options },
  };
}

/** Said before the run's input in place of the Players' preamble. */
export const ANALYST_PREAMBLE =
  "You are the Analyst for a game league. The Match below has ended. Follow your instructions in /.agents/AGENTS.md and call submit_report exactly once. Do not run code, browse or write files.";

/** Check an operator-supplied Analyst config; null when valid. */
export function analystConfigError(c: unknown): string | null {
  const x = c as Record<string, unknown>;
  if (typeof x !== "object" || x === null || typeof x.harness !== "string" || !x.harness) {
    return "analyst must be null or { harness, model?, options?, deadlineMs?, maxWaitMs? }";
  }
  if (x.model !== undefined && typeof x.model !== "string") return "analyst.model must be a string";
  if (x.options !== undefined && (typeof x.options !== "object" || x.options === null)) return "analyst.options must be an object";
  for (const k of ["deadlineMs", "maxWaitMs"]) {
    const v = x[k];
    if (v !== undefined && !(typeof v === "number" && Number.isFinite(v) && v > 0)) return `analyst.${k} must be a positive number`;
  }
  return null;
}

// ---- League slots ----------------------------------------------------------

/**
 * Analyst runs in flight in a League: Match ID → lease expiry (epoch ms). A Match
 * releases its slot when its run ends; a lease that expires (a Match that never
 * released) frees the slot anyway, so one lost Match can't block analysis.
 */
export type AnalystSlots = Record<string, number>;

/**
 * Try to take a slot for `matchId`. A Match already holding one keeps it (so a
 * retried request is granted again). Waiting Matches are not queued in order: each
 * retries until a slot is free, or gives up after its maxWaitMs.
 */
export function acquireSlot(
  slots: AnalystSlots,
  matchId: string,
  now: number,
  cap: number,
  leaseMs: number,
): { slots: AnalystSlots; granted: boolean } {
  const live: AnalystSlots = Object.fromEntries(Object.entries(slots).filter(([, until]) => until > now));
  if (matchId in live) return { slots: live, granted: true };
  if (Object.keys(live).length >= cap) return { slots: live, granted: false };
  return { slots: { ...live, [matchId]: now + leaseMs }, granted: true };
}

// ---- the report ----------------------------------------------------------

export const REPORT_LIMITS = { turningPointsMin: 2, turningPointsMax: 4, mistakesMax: 5, mistakesPerPlayer: 2 };

const str = (description: string) => ({ type: "string", description });
const seatSchema = { type: "integer", description: "Seat number" };

export const REPORT_TOOL: ToolSpec = {
  name: "submit_report",
  description: "File your analysis of the Match. Call it exactly once; it ends your run.",
  parameters: {
    type: "object",
    properties: {
      summary: str("2 or 3 sentences: who won, how, and the shape of the Match."),
      turning_points: {
        type: "array",
        minItems: REPORT_LIMITS.turningPointsMin,
        maxItems: REPORT_LIMITS.turningPointsMax,
        items: {
          type: "object",
          properties: { when: str('The moment, e.g. "Day 2 vote".'), what: str("One sentence.") },
          required: ["when", "what"],
        },
      },
      mistakes: {
        type: "array",
        maxItems: REPORT_LIMITS.mistakesMax,
        description: "Most consequential first; at most 2 per Player; may be empty.",
        items: {
          type: "object",
          properties: {
            seat: seatSchema,
            agent: str("The seat's Agent name from the log."),
            what: str("One sentence: what the Player did and why it was wrong given what they knew."),
            evidence: str("The moment, the Player's own words, reason or beliefs, and the fact that makes it a mistake."),
          },
          required: ["seat", "agent", "what", "evidence"],
        },
      },
      best_play: {
        type: "object",
        properties: { seat: seatSchema, why: str("One or two sentences.") },
        required: ["seat", "why"],
      },
      why_winner_won: str("2 or 3 sentences on the real cause."),
    },
    required: ["summary", "turning_points", "mistakes", "best_play", "why_winner_won"],
  },
};

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Check a submit_report call against the schema and the field limits. */
export function validateReport(call: ToolCall, seats: Seat[]): Validation {
  const fail = (error: string): Validation => ({ ok: false, error: `${error}. Call submit_report again with a corrected report.` });
  if (call.name !== REPORT_TOOL.name) return fail(`Unknown tool ${call.name}: the only tool is submit_report`);
  const a = call.args;
  const badSeat = (s: unknown) => (typeof s === "number" && seats.includes(s) ? null : `seat ${String(s)} is not a seat of this Match`);
  if (!isText(a.summary)) return fail("summary must be a non-empty string");
  if (!isText(a.why_winner_won)) return fail("why_winner_won must be a non-empty string");
  const tps = a.turning_points;
  const { turningPointsMin: tMin, turningPointsMax: tMax, mistakesMax, mistakesPerPlayer } = REPORT_LIMITS;
  if (!Array.isArray(tps) || tps.length < tMin || tps.length > tMax) return fail(`turning_points must list ${tMin} to ${tMax} moments`);
  if (!tps.every((t) => isObj(t) && isText(t.when) && isText(t.what))) return fail("each turning point needs when and what");
  const ms = a.mistakes;
  if (!Array.isArray(ms) || ms.length > mistakesMax) return fail(`mistakes must be a list of at most ${mistakesMax}`);
  const perSeat = new Map<unknown, number>();
  for (const m of ms) {
    if (!isObj(m) || !isText(m.agent) || !isText(m.what) || !isText(m.evidence)) return fail("each mistake needs seat, agent, what and evidence");
    const seatError = badSeat(m.seat);
    if (seatError) return fail(`mistakes: ${seatError}`);
    perSeat.set(m.seat, (perSeat.get(m.seat) ?? 0) + 1);
    if (perSeat.get(m.seat)! > mistakesPerPlayer) return fail(`at most ${mistakesPerPlayer} mistakes per Player (seat ${String(m.seat)} has more)`);
  }
  const bp = a.best_play;
  if (!isObj(bp) || !isText(bp.why)) return fail("best_play needs seat and why");
  const bpError = badSeat(bp.seat);
  if (bpError) return fail(`best_play: ${bpError}`);
  return { ok: true };
}

/** Keep only the report's fields (drops anything extra the model added). */
export function reportOf(args: Record<string, unknown>): AnalysisReport {
  const a = args as unknown as AnalysisReport;
  return {
    summary: a.summary,
    turning_points: a.turning_points.map(({ when, what }) => ({ when, what })),
    mistakes: a.mistakes.map(({ seat, agent, what, evidence }) => ({ seat, agent, what, evidence })),
    best_play: { seat: a.best_play.seat, why: a.best_play.why },
    why_winner_won: a.why_winner_won,
  };
}

// ---- the analysis event ----------------------------------------------------

export const ANALYSIS_EVENT_KIND = "analysis";

export function analysisEvent(data: AnalysisEventData): RulesetEvent {
  return { kind: ANALYSIS_EVENT_KIND, audience: [], data: { ...data } };
}
