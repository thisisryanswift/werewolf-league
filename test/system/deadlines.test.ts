import { describe, expect, it } from "vitest";
import { fakeAgent, finished, snapshot, startMatch, waitFor } from "./helpers";

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

  it("counts timeouts per Player and per Agent in Match stats and in the Match result", async () => {
    // One silent Agent fills seats 2 and 5; everyone else answers.
    const agents = Array.from({ length: 7 }, (_, i) =>
      i === 1 || i === 4 ? fakeAgent("mute", { script: "silent" }) : fakeAgent(`ok-${i + 1}`),
    );
    const matchId = await startMatch({ seed: "count-timeouts", agents, deadlines });
    const snap = await finished(matchId);
    const turnsOf = (seat: number) => snap.events.filter((e) => e.kind === "turn_started" && e.data.seat === seat).length;
    const expected = {
      bySeat: { 1: 0, 2: turnsOf(2), 3: 0, 4: 0, 5: turnsOf(5), 6: 0, 7: 0 },
      byAgent: { mute: turnsOf(2) + turnsOf(5), "ok-1": 0, "ok-3": 0, "ok-4": 0, "ok-6": 0, "ok-7": 0 },
    };
    expect(expected.byAgent.mute).toBeGreaterThan(1);
    expect(snap.stats.timeouts).toEqual(expected);
    expect(snap.result?.timeouts).toEqual(expected);
  });

  it("exposes live timeout counts while the Match is running", async () => {
    const agents = Array.from({ length: 7 }, (_, i) =>
      i === 1 ? fakeAgent("mute", { script: "silent" }) : fakeAgent(`ok-${i + 1}`),
    );
    // With this seed seat 2 is a Werewolf, so it acts on Night 1.
    const matchId = await startMatch({ seed: "live-counts", agents, deadlines });
    const live = await waitFor(async () => {
      const s = await snapshot(matchId);
      return s.status === "running" && s.stats.timeouts.byAgent.mute! > 0 ? s : null;
    });
    expect(live.stats.timeouts.bySeat[2]).toBeGreaterThan(0);
    expect(live.result).toBeNull();
  });
});
