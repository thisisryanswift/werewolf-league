// The Narrator interface: an observer that reads a Match's Narrator's View log and
// scores it for Spectators (Drama Score, Drama Flags). It never affects play,
// observations, ratings, Calibration or Table Suspicion. Ruleset-agnostic: the
// questions and the log text come from the Ruleset's `narration` hook.
// Implementations: the scripted fake (src/narrator/fake.ts) and gemini-decision-1
// (src/narrator/decisions.ts).

import type { DramaFlagVisibility, RulesetEvent } from "../shared/protocol";
import type { UsageReading } from "./usage";

export type { DramaFlagVisibility };

/** A yes/no Drama Flag question. */
export interface DramaFlagQuestion {
  id: string;
  visibility: DramaFlagVisibility;
  /** The yes/no question, e.g. "Are two players claiming the same role?". */
  question: string;
  /** Optional descriptions of what "yes" and "no" mean. */
  yes?: string;
  no?: string;
}

/** What a Ruleset asks the Narrator: one drama score question and some yes/no Drama Flags. */
export interface NarrationQuestions {
  drama: {
    question: string;
    /** Ordered level descriptions, calm first, explosive last (at least 2). */
    levels: string[];
  };
  flags: DramaFlagQuestion[];
}

/** One Narrator call: the Narrator's View log as text plus the Ruleset's questions. */
export interface NarrationInput {
  matchId: string;
  log: string;
  questions: NarrationQuestions;
}

export interface NarratedFlag {
  id: string;
  /** P(yes), 0..1. */
  value: number;
  visibility: DramaFlagVisibility;
}

export interface Narration {
  /** 0 (calm) to 1 (explosive). */
  dramaScore: number;
  flags: NarratedFlag[];
  /** The call's billed usage, if the Narrator's API reports it. */
  usage?: UsageReading[];
}

export interface Narrator {
  /** Score a Narrator's View log. Should stop work when `signal` aborts. */
  narrate(input: NarrationInput, signal: AbortSignal): Promise<Narration>;
}

/** Per-Match Narrator choice; JSON so it travels in MatchInit and League config. */
export interface NarratorConfig {
  /** "fake" or "decisions". */
  id: string;
  /** A flag is active when its value is at or above this. Default 0.7. */
  threshold?: number;
  /** A call slower than this is dropped. Default 5000 ms. */
  timeoutMs?: number;
  /** Implementation-specific options (e.g. the fake's script). */
  options?: Record<string, unknown>;
}

export const DEFAULT_DRAMA_THRESHOLD = 0.7;
export const DEFAULT_NARRATOR_TIMEOUT_MS = 5000;

/** Event kinds the Match runner commits for a narration. */
export const NARRATION_EVENT_KINDS: ReadonlySet<string> = new Set(["drama", "drama_secret"]);
export const isNarrationEvent = (e: { kind: string }): boolean => NARRATION_EVENT_KINDS.has(e.kind);

/**
 * The events for one narration: Drama Score and public-safe flags for everyone,
 * secret flags for Narrator's View only (audience []).
 */
export function narrationEvents(n: Narration, threshold: number, throughSeq: number): RulesetEvent[] {
  const flags = n.flags.map((f) => ({ id: f.id, value: f.value, visibility: f.visibility, active: f.value >= threshold }));
  const events: RulesetEvent[] = [
    {
      kind: "drama",
      audience: "all",
      data: { throughSeq, dramaScore: n.dramaScore, flags: flags.filter((f) => f.visibility === "public-safe") },
    },
  ];
  const secret = flags.filter((f) => f.visibility === "secret");
  if (secret.length) events.push({ kind: "drama_secret", audience: [], data: { throughSeq, flags: secret } });
  return events;
}

type FlagData = { id: string; visibility: DramaFlagVisibility; active: boolean };

/** The tile's Drama fields from the latest narration in a log (empty before the first). */
export function latestDrama(
  events: { kind: string; data: Record<string, unknown> }[],
): { dramaScore?: number; dramaFlags?: { id: string; visibility: DramaFlagVisibility }[] } {
  let at = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.kind === "drama") {
      at = i;
      break;
    }
  }
  if (at < 0) return {};
  const pub = events[at]!;
  const through = pub.data.throughSeq;
  const secret = events.find((e, i) => i > at && e.kind === "drama_secret" && e.data.throughSeq === through);
  const flags = [...(pub.data.flags as FlagData[]), ...((secret?.data.flags as FlagData[] | undefined) ?? [])];
  return {
    dramaScore: Number(pub.data.dramaScore),
    dramaFlags: flags.filter((f) => f.active).map((f) => ({ id: f.id, visibility: f.visibility })),
  };
}

/**
 * Runs at most one job at a time. A request while one runs marks it dirty, and
 * the job runs once more afterwards on whatever is current then, so a newer
 * step supersedes any that queued behind it. In memory only: an evicted Match
 * simply starts afresh on its next step.
 */
export class LatestOnly {
  private running = false;
  private dirty = false;

  constructor(private readonly job: () => Promise<void>) {}

  /** Request a run. Returns the running loop when one starts, else null. */
  kick(): Promise<void> | null {
    if (this.running) {
      this.dirty = true;
      return null;
    }
    this.running = true;
    return this.loop();
  }

  private async loop(): Promise<void> {
    try {
      do {
        this.dirty = false;
        await this.job().catch(() => {});
      } while (this.dirty);
    } finally {
      this.running = false;
    }
  }
}

/** Run one call with a deadline: aborts and rejects once `timeoutMs` passes, even if the callee ignores the signal. */
export function withDeadline<T>(timeoutMs: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error("narrator timed out"));
    }, timeoutMs);
  });
  return Promise.race([call(ctl.signal), timeout]).finally(() => clearTimeout(timer));
}

/**
 * One narration of a Match: render its Narrator's View log through the Ruleset's hook,
 * ask the Narrator under the deadline and return the events to commit, with the call's usage. Rejects
 * on failure or timeout (the caller drops it and the tile keeps its last value).
 * `events` must already exclude runner and narration events.
 */
export async function narrateMatch(args: {
  matchId: string;
  config: NarratorConfig;
  narrator: Narrator;
  hook: { questions: NarrationQuestions; log(state: unknown, events: RulesetEvent[]): string };
  state: unknown;
  events: RulesetEvent[];
  throughSeq: number;
}): Promise<{ events: RulesetEvent[]; usage: UsageReading[] }> {
  const input: NarrationInput = { matchId: args.matchId, log: args.hook.log(args.state, args.events), questions: args.hook.questions };
  const timeoutMs = args.config.timeoutMs ?? DEFAULT_NARRATOR_TIMEOUT_MS;
  const n = await withDeadline(timeoutMs, (signal) => args.narrator.narrate(input, signal));
  return { events: narrationEvents(n, args.config.threshold ?? DEFAULT_DRAMA_THRESHOLD, args.throughSeq), usage: n.usage ?? [] };
}
