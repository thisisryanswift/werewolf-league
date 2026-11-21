import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { dealtWolves, fakeAgent, finished, snapshot, startMatch, waitFor } from "./helpers";

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

describe("the Match backstop", () => {
  it("expires the turns of a Player DO that never reports back, and the Match continues", async () => {
    const seed = "backstop";
    const wolves = dealtWolves(seed);
    const seat = wolves[0]!; // acts on Night 1
    // The seat never answers, so only a missing report (not a fast answer) can explain a backstop expiry.
    const agents = Array.from({ length: 7 }, (_, i) =>
      i + 1 === seat ? fakeAgent("lost", { script: "silent" }) : fakeAgent(`a-${i + 1}`),
    );
    const matchId = await startMatch({ seed, agents, deadlines });

    // Fault: once its first turn is dispatched, the seat's Player DO loses all its state
    // and never wakes, so it never reports anything for this or any later turn.
    await waitFor(async () => {
      const s = await snapshot(matchId);
      return s.events.some((e) => e.kind === "turn_started" && e.data.seat === seat);
    });
    await runInDurableObject(env.PLAYER.getByName(`${matchId}:${seat}`), async (_instance, state) => {
      await state.storage.deleteAlarm();
      await state.storage.deleteAll();
    });

    const done = await finished(matchId);
    const started = done.events.filter((e) => e.kind === "turn_started" && e.data.seat === seat);
    const timedOut = done.events.filter((e) => e.kind === "turn_timed_out");
    expect(started.length).toBeGreaterThan(0);
    expect(timedOut.map((e) => [e.data.seat, e.data.by])).toEqual(started.map(() => [seat, "backstop"]));
    expect(done.stats.timeouts.bySeat[seat]).toBe(started.length);
    expect(done.events.filter((e) => e.kind !== "match_cost").at(-1)?.kind).toBe("match_over");
  });
});

describe("a response that arrives after the deadline", () => {
  it("is not applied even before the backstop fires; the turn gets its default", async () => {
    const seed = "late-before-backstop";
    const wolves = dealtWolves(seed);
    const [late, other] = [wolves[0]!, wolves[1]!];
    // The other wolf proposes nothing, so a kill on Night 1 could only come from the late call.
    const agents = Array.from({ length: 7 }, (_, i) =>
      i + 1 === late
        ? fakeAgent("late", { script: "silent" })
        : i + 1 === other
          ? fakeAgent("idle", { script: "no-call" })
          : fakeAgent(`a-${i + 1}`),
    );
    // A long grace: the backstop must not be what rejects the late call.
    const matchId = await startMatch({ seed, agents, deadlines: { ...deadlines, graceMs: 5_000 } });
    // Its earlier Wolf Chat turns time out normally; the kill turn is the one answered late.
    const started = await waitFor(async () => {
      const s = await snapshot(matchId);
      return s.events.find((e) => e.kind === "turn_started" && e.data.seat === late && e.data.actionKind === "choose_kill");
    });
    // The seat's Player DO goes quiet, so only the late call below reaches the Match.
    await runInDurableObject(env.PLAYER.getByName(`${matchId}:${late}`), async (_instance, state) => {
      await state.storage.deleteAlarm();
      await state.storage.deleteAll();
    });
    await new Promise((r) => setTimeout(r, Number(started.data.deadlineMs) + 100));

    const victim = [1, 2, 3, 4, 5, 6, 7].find((s) => !wolves.includes(s))!;
    const match = env.MATCH.getByName(matchId);
    const res = await match.submitAction(`${matchId}:${started.data.step}:${late}`, late, {
      name: "choose_kill",
      args: { target: victim },
    });
    expect(res).toEqual({ status: "stale" });

    const night1 = await waitFor(async () => {
      const s = await snapshot(matchId);
      return s.events.some((e) => e.kind === "night_passed") ? s : null;
    });
    expect(night1.events.find((e) => e.kind === "night_passed")?.data.killed).toBeNull();
    const killTimeouts = night1.events.filter((e) => e.kind === "turn_timed_out" && e.data.actionKind === "choose_kill");
    expect(killTimeouts.map((e) => [e.data.seat, e.data.by])).toEqual([
      [late, "late"],
    ]);
  });
});

describe("an Agent that misses exactly one turn", () => {
  it("has its default recorded once, its late response ignored, and acts normally next turn with what it missed", async () => {
    const seed = "miss-once";
    const wolves = dealtWolves(seed);
    const seat = [1, 2, 3, 4, 5, 6, 7].find((s) => !wolves.includes(s))!; // a villager: its first turn is Day 1 Speech Round A
    // Everyone else passes (no kill, silence, Abstain). The villager misses its first turn,
    // then speaks in Round B, but only if its next observation repeats what it
    // missed: the briefing and Night 1.
    const agents = Array.from({ length: 7 }, (_, i) =>
      i + 1 === seat
        ? fakeAgent("flaky", {
            silentTurns: [1],
            prefer: [wolves[0]],
            requireText: ["You are playing Werewolf", "Night 1 passed"],
          })
        : fakeAgent(`pass-${i + 1}`, { script: "passive" }),
    );
    const matchId = await startMatch({ seed, agents, deadlines });

    // Day 1 Speech Round A resolves with the villager timed out.
    const day1 = await waitFor(async () => {
      const s = await snapshot(matchId);
      return s.events.some((e) => e.kind === "speech" && e.data.seat === seat) ? s : null;
    });
    const missed = day1.events.find((e) => e.kind === "turn_started" && e.data.seat === seat)!;
    // The late answer to that turn arrives after the Match moved on: it is dropped.
    const turnId = `${matchId}:${missed.data.step}:${seat}`; // the Match's turn ID format
    const match = env.MATCH.getByName(matchId);
    const lateSpeech = { name: "speak", args: { text: "late" } };
    expect(await match.submitAction(turnId, seat, lateSpeech)).toEqual({ status: "stale" });
    expect(await match.reportTimeout(turnId, seat)).toEqual({ status: "stale" });

    const done = await finished(matchId);
    // Only the seat's first assignment gets the longer first-turn deadline, even though
    // its second turn repeats the briefing.
    const turnsOfSeat = done.events.filter((e) => e.kind === "turn_started" && e.data.seat === seat);
    expect(turnsOfSeat.slice(0, 2).map((e) => e.data.deadlineMs)).toEqual([deadlines.firstTurnMs, deadlines.turnMs]);
    const timeouts = done.events.filter((e) => e.kind === "turn_timed_out");
    expect(timeouts.map((e) => e.data)).toEqual([{ step: missed.data.step, seat, actionKind: "speak", by: "player" }]);
    expect(done.stats.timeouts.bySeat[seat]).toBe(1);
    expect(done.result?.timeouts.byAgent.flaky).toBe(1);

    // Round A defaulted to silence; Round B was spoken with what the seat had missed.
    const spoken = done.events.filter((e) => e.kind === "speech" && e.data.seat === seat && e.data.cycle === 1);
    expect(spoken.map((e) => [e.data.round, e.data.skipped])).toEqual([
      ["A", true],
      ["B", false],
    ]);
  });
});
