// The gemini-decision-1 Narrator against a stubbed Decisions API: the request
// shape (FINDINGS section 8, Decisions API guide) and answer parsing. The real
// API is only exercised in a manual smoke test.

import { describe, expect, it } from "vitest";
import { DECISIONS_URL, decisionsNarrator } from "../../src/narrator/decisions";
import type { NarrationInput } from "../../src/core/narrator";

const input: NarrationInput = {
  matchId: "m1",
  log: "Seat 1 claims Seer. Seat 4 also claims Seer.",
  questions: {
    drama: { question: "How dramatic?", levels: ["Calm", "Simmering", "Tense", "Explosive"] },
    flags: [
      { id: "claim_war", visibility: "public-safe", question: "Claim war?" },
      { id: "wolves_split", visibility: "secret", question: "Wolves split?", yes: "They disagree.", no: "They agree." },
    ],
  },
};

function stub(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}

describe("the Decisions Narrator", () => {
  it("asks one score question and one yes/no question per Drama Flag, and scales the score to 0..1", async () => {
    const api = stub(200, {
      answers: {
        drama: { type: "score", score: 2.25, confidence: 0.5 },
        flag_claim_war: { type: "noul", noul: 0.91, confidence: 0.91 },
        flag_wolves_split: { type: "noul", noul: 0.12, confidence: 0.88 },
      },
      usage: { total_input_tokens: 300, total_output_tokens: 0 },
    });
    const n = await decisionsNarrator({ apiKey: "k-test", fetch: api.fetch }).narrate(input, new AbortController().signal);

    expect(n).toEqual({
      dramaScore: 0.75,
      flags: [
        { id: "claim_war", value: 0.91, visibility: "public-safe" },
        { id: "wolves_split", value: 0.12, visibility: "secret" },
      ],
    });
    expect(api.calls).toHaveLength(1);
    const { url, init } = api.calls[0]!;
    expect(url).toBe(DECISIONS_URL);
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/decisions");
    expect(url).not.toContain("k-test");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k-test");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "gemini-decision-1",
      input: input.log,
      questions: {
        drama: { type: "score", instructions: "How dramatic?", criteria: ["Calm", "Simmering", "Tense", "Explosive"] },
        flag_claim_war: { type: "noul", instructions: "Claim war?" },
        flag_wolves_split: {
          type: "noul",
          instructions: "Wolves split?",
          criteria: { true_description: "They disagree.", false_description: "They agree." },
        },
      },
    });
  });

  it("rejects an error response or a missing answer", async () => {
    const err = stub(429, { error: { message: "quota" } });
    await expect(decisionsNarrator({ apiKey: "k", fetch: err.fetch }).narrate(input, new AbortController().signal)).rejects.toThrow(
      /429/,
    );
    const partial = stub(200, { answers: { drama: { type: "score", score: 1 } } });
    await expect(
      decisionsNarrator({ apiKey: "k", fetch: partial.fetch }).narrate(input, new AbortController().signal),
    ).rejects.toThrow(/claim_war/);
  });
});
