import { describe, expect, it } from "vitest";
import { fakeAgent, finished, startMatch } from "./helpers";

// Small deadlines so timeouts happen quickly in tests.
const deadlines = { turnMs: 150, firstTurnMs: 250, graceMs: 150 };

describe("deadlines and default actions", () => {
  it("an Agent that never answers gets defaults and the Match still finishes", async () => {
    const agents = Array.from({ length: 7 }, (_, i) =>
      i === 2 ? fakeAgent("mute", { script: "silent" }) : fakeAgent(`ok-${i + 1}`),
    );
    const snap = await finished(await startMatch({ seed: "never-answers", agents, deadlines }));
    expect(snap.result?.winner).toMatch(/wolf|village/);

    const started = snap.events.filter((e) => e.kind === "turn_started" && e.data.seat === 3);
    const timedOut = snap.events.filter((e) => e.kind === "turn_timed_out");
    expect(started.length).toBeGreaterThan(0);
    // Every turn the silent seat got timed out; nobody else timed out.
    expect(timedOut.map((e) => e.data.seat)).toEqual(started.map(() => 3));
    expect(timedOut.every((e) => e.data.by === "player")).toBe(true);
  });
});
