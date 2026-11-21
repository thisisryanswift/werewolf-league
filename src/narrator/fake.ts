// Scripted fake Narrator: replaces gemini-decision-1 in tests and local demos.
// Behaviour comes from NarratorConfig.options (JSON):
//   dramaScore: number        — Drama Score of every call (default 0.5)
//   scores: number[]          — Drama Score per call (1-based order; the last repeats)
//   flags: { [id]: number }   — value per Drama Flag question (default 0)
//   failAfter: number         — calls after this many fail
//   hangAfter: number         — calls after this many never answer (until aborted)
//   delayMs: number           — answer after this long (an abort stops the wait)
//   reportInFlight: true      — add a "fake_max_in_flight" flag whose value is the
//                               most calls this fake has seen in flight at once for the Match
//   inputTokens: number       — report this many input tokens per answered call, billed as gemini-decision-1

import type { Narration, NarrationInput, Narrator } from "../core/narrator";

interface FakeNarratorOptions {
  dramaScore?: number;
  scores?: number[];
  flags?: Record<string, number>;
  failAfter?: number;
  hangAfter?: number;
  delayMs?: number;
  reportInFlight?: boolean;
  inputTokens?: number;
}

/** Per-Match call counters, kept across Narrator instances (an instance may be rebuilt). */
const stats = new Map<string, { calls: number; inFlight: number; maxInFlight: number }>();

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("aborted"));
    const timer = Number.isFinite(ms) ? setTimeout(resolve, ms) : undefined;
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}

export function fakeNarrator(options: Record<string, unknown> = {}): Narrator {
  const opts = options as FakeNarratorOptions;
  return {
    async narrate(input: NarrationInput, signal: AbortSignal): Promise<Narration> {
      const s = stats.get(input.matchId) ?? { calls: 0, inFlight: 0, maxInFlight: 0 };
      stats.set(input.matchId, s);
      s.calls += 1;
      s.inFlight += 1;
      s.maxInFlight = Math.max(s.maxInFlight, s.inFlight);
      const call = s.calls;
      try {
        if (opts.hangAfter !== undefined && call > opts.hangAfter) await wait(Infinity, signal);
        if (opts.delayMs) await wait(opts.delayMs, signal);
        if (opts.failAfter !== undefined && call > opts.failAfter) throw new Error("scripted Narrator failure");
        const dramaScore = opts.scores?.length ? opts.scores[Math.min(call, opts.scores.length) - 1]! : (opts.dramaScore ?? 0.5);
        const flags = input.questions.flags.map((q) => ({ id: q.id, value: opts.flags?.[q.id] ?? 0, visibility: q.visibility }));
        if (opts.reportInFlight) flags.push({ id: "fake_max_in_flight", value: s.maxInFlight, visibility: "public-safe" });
        const usage = opts.inputTokens
          ? [{ id: `${input.matchId}:narration:${call}`, model: "gemini-decision-1", usage: { input: opts.inputTokens, cached: 0, thought: 0, output: 0 } }]
          : undefined;
        return { dramaScore, flags, ...(usage ? { usage } : {}) };
      } finally {
        s.inFlight -= 1;
      }
    },
  };
}
