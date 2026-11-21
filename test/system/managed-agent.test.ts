// A whole Match on the managed-agent harness, through real Match/Player DOs and
// alarms, against the stubbed Interactions API (the real API is never called).
// Every stub Agent opens each turn with an out-of-phase call, then corrects
// itself from the error function_result, which names the required action.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import { API_BASE } from "../../src/harness/managed-agent/api";
import { StubInteractionsApi } from "../harness/stub-interactions-api";
import { finished, startMatch } from "./helpers";

const REQUIRED = /Required action: (\w+) with target one of ([^.]+)\./;

/** Answer every running interaction: out-of-phase first, then whatever the error asks for. */
function autoAgent(api: StubInteractionsApi): void {
  for (const it of api.interactions.values()) {
    if (it.status !== "in_progress") continue;
    if (typeof it.body.input === "string" && it.body.input.includes("Setup only")) continue;
    const m = REQUIRED.exec(JSON.stringify(it.body.input));
    if (!m) {
      // Opening move: speak, which is out of phase outside the Day's speeches.
      api.callTool(it.id, "speak", { text: "I speak out of turn." });
      continue;
    }
    const first = m[2]!.split(",")[0]!.trim();
    const target = first === "abstain" ? "abstain" : Number(first);
    api.callTool(it.id, m[1]!, { target, beliefs: {}, reason: "stub" });
  }
}

afterEach(() => vi.restoreAllMocks());

describe("a Match on the managed-agent harness (stubbed API)", () => {
  it("runs to a result, with Agents recovering from out-of-phase calls via the error function_result", async () => {
    const api = new StubInteractionsApi();
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith(API_BASE)) return realFetch(input, init);
      const res = await api.fetch(input, init);
      autoAgent(api);
      return res;
    });

    const agents: AgentConfig[] = Array.from({ length: 7 }, (_, i) => ({
      id: `ma-${i + 1}`,
      name: `MA ${i + 1}`,
      harness: "managed-agent",
      model: "gemini-4-hydrogen",
      instructions: "Stub instructions.",
    }));
    const snap = await finished(await startMatch({ seed: "managed-agent-stub", agents }));
    expect(["wolf", "village"]).toContain(snap.result?.winner);

    // Out-of-phase speeches were rejected by the Match and came back as error function_results.
    const errors = api
      .creates()
      .flatMap((b) => (Array.isArray(b.input) ? b.input : []))
      .filter((i: any) => i.result?.accepted === false && REQUIRED.test(String(i.result?.error)));
    expect(errors.length).toBeGreaterThan(0);
    expect(api.requests.every((r) => r.apiKey === "test-gemini-key")).toBe(true);
  });
});
