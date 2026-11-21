import { describe, expect, it } from "vitest";
import { decisions, fakeAgent, finished, startMatch } from "./helpers";

describe("Match determinism and invalid calls", () => {
  it("the same seed and Agents produce an identical event log", async () => {
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`d${i + 1}`, { delayPolls: i % 3 }));
    const [a, b] = await Promise.all([startMatch({ seed: "same", agents }), startMatch({ seed: "same", agents })]);
    const [sa, sb] = await Promise.all([finished(a), finished(b)]);
    expect(decisions(sa.events)).toEqual(decisions(sb.events));
  });

  it("an Agent that makes an illegal call is told why and its corrected call counts", async () => {
    const sloppy = Array.from({ length: 7 }, (_, i) => fakeAgent(`x${i + 1}`, { invalidFirst: true }));
    const clean = Array.from({ length: 7 }, (_, i) => fakeAgent(`y${i + 1}`));
    const [s1, s2] = await Promise.all([
      finished(await startMatch({ seed: "retry", agents: sloppy })),
      finished(await startMatch({ seed: "retry", agents: clean })),
    ]);
    // Same decisions as Agents that were right first time: no defaults were applied.
    // (The setup event names the Agents, so compare from the deal onwards.)
    expect(s1.events[0]?.kind).toBe("match_setup");
    expect(decisions(s1.events.slice(1))).toEqual(decisions(s2.events.slice(1)));
  });
});
