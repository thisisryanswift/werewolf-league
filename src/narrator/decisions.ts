// The gemini-decision-1 Narrator: one Decisions API call (v1beta) per narration,
// with one `score` question for drama and one `noul` (yes/no) question per Drama
// Flag. Answers are never summed (FINDINGS section 8's over-summing caveat does
// not apply). Plain fetch; errors carry the status and a slice of the body, never
// request headers.

import type { Narration, NarrationInput, Narrator } from "../core/narrator";

export const DECISIONS_URL = "https://generativelanguage.googleapis.com/v1beta/decisions";
export const DECISION_MODEL = "gemini-decision-1";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DRAMA_KEY = "drama";
const flagKey = (id: string) => `flag_${id}`;

/** The Decisions request body for one narration. */
export function decisionsRequest(input: NarrationInput): Record<string, unknown> {
  const questions: Record<string, unknown> = {
    [DRAMA_KEY]: { type: "score", instructions: input.questions.drama.question, criteria: input.questions.drama.levels },
  };
  for (const f of input.questions.flags) {
    questions[flagKey(f.id)] = {
      type: "noul",
      instructions: f.question,
      ...(f.yes && f.no ? { criteria: { true_description: f.yes, false_description: f.no } } : {}),
    };
  }
  return { model: DECISION_MODEL, input: input.log, questions };
}

interface Answer {
  type?: string;
  noul?: number;
  score?: number;
}

export function decisionsNarrator(opts: { apiKey: string; fetch?: Fetch }): Narrator {
  const fetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
  return {
    async narrate(input: NarrationInput, signal: AbortSignal): Promise<Narration> {
      if (!opts.apiKey) throw new Error("Decisions Narrator: no GEMINI_API_KEY");
      const res = await fetchFn(DECISIONS_URL, {
        method: "POST",
        headers: { "x-goog-api-key": opts.apiKey, "content-type": "application/json" },
        body: JSON.stringify(decisionsRequest(input)),
        signal,
      });
      if (!res.ok) throw new Error(`Decisions API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { answers?: Record<string, Answer> };
      const answers = body.answers ?? {};
      const top = input.questions.drama.levels.length - 1;
      const score = answers[DRAMA_KEY]?.score;
      if (typeof score !== "number") throw new Error("Decisions API: no drama score in the answer");
      return {
        dramaScore: Math.min(1, Math.max(0, score / top)),
        flags: input.questions.flags.map((f) => {
          const v = answers[flagKey(f.id)]?.noul;
          if (typeof v !== "number") throw new Error(`Decisions API: no answer for flag ${f.id}`);
          return { id: f.id, value: v, visibility: f.visibility };
        }),
      };
    },
  };
}
