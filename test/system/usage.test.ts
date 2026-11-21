// Measured spend: scripted per-turn usage from the Fake Harness (and the fake
// Narrator) aggregates to exact per-Player, per-Agent, per-Match and League
// totals, including cancelled (timed-out) turns. Whole system: real League,
// Match and Player DOs and alarms; no model is ever called.

import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import type { LeagueSnapshot, MatchCost, MatchEvent } from "../../src/shared/protocol";
import type { MatchCostData } from "../../src/shared/turn-events";
import { ADMIN, fakeAgent, finished, snapshot, startMatch, waitFor } from "./helpers";

// Per-interaction usage and its price, worked by hand from the price table:
// Hydrogen: 6,000 uncached × $1.50/M + 4,000 cached × $0.075/M + 1,000 out+thought × $7.50/M = $0.0168.
const TALK = { input: 10_000, cached: 4_000, thought: 800, output: 200 };
const TALK_USD = 0.0168;
// 3.5 Flash-Lite: 2,000 uncached × $0.30/M + 500 thought × $2.50/M = $0.00185.
const MUTE = { input: 2_000, cached: 0, thought: 500, output: 0 };
const MUTE_USD = 0.00185;
// gemini-decision-1: 30,000 input × $0.10/M = $0.003.
const NARRATION_USD = 0.003;

const talk = (id: string): AgentConfig => ({ ...fakeAgent(id, { usage: TALK }), model: "gemini-4-hydrogen" });
const mute = (id: string): AgentConfig => ({ ...fakeAgent(id, { script: "silent", usage: MUTE }), model: "gemini-3.5-flash-lite" });

const deadlines = { turnMs: 300, firstTurnMs: 400, graceMs: 300 };
const turnsOf = (events: MatchEvent[], seat: number) => events.filter((e) => e.kind === "turn_started" && e.data.seat === seat).length;
const latestCost = (events: MatchEvent[]) => events.filter((e) => e.kind === "match_cost").at(-1)?.data as MatchCostData | undefined;

async function league(): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch("http://test/api/league");
  return res.json();
}

async function admin(op: string, body?: unknown) {
  const r = await exports.default.fetch(`http://test/api/admin/league/${op}`, {
    method: "POST",
    headers: { ...ADMIN, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

describe("measured Match cost", () => {
  it("adds every interaction's cost per Player and per Agent, counting timed-out (cancelled) turns", async () => {
    // "mute" never answers (every turn times out and is cancelled) in seats 2 and 5.
    const agents = Array.from({ length: 7 }, (_, i) => (i === 1 || i === 4 ? mute("mute") : talk(`talk-${i + 1}`)));
    const matchId = await startMatch({ seed: "usage-exact", agents, deadlines });
    const snap = await finished(matchId);
    const cost = snap.result!.cost as MatchCost;

    expect(turnsOf(snap.events, 2) + turnsOf(snap.events, 5)).toBeGreaterThan(1);
    expect(snap.events.filter((e) => e.kind === "turn_timed_out").length).toBe(turnsOf(snap.events, 2) + turnsOf(snap.events, 5));
    for (let seat = 1; seat <= 7; seat++) {
      const each = seat === 2 || seat === 5 ? MUTE_USD : TALK_USD;
      expect(cost.bySeat[seat], `seat ${seat}`).toBeCloseTo(turnsOf(snap.events, seat) * each, 10);
    }
    expect(cost.byAgent.mute).toBeCloseTo((turnsOf(snap.events, 2) + turnsOf(snap.events, 5)) * MUTE_USD, 10);
    expect(cost.byAgent["talk-1"]).toBeCloseTo(turnsOf(snap.events, 1) * TALK_USD, 10);
    const sum = Object.values(cost.byAgent).reduce((a, b) => a + b, 0);
    expect(cost.total).toBeCloseTo(sum, 10);
    expect(cost.narrator).toBe(0);
    expect(cost.unpriced).toEqual([]);
    const talkTurns = [1, 3, 4, 6, 7].reduce((n, s) => n + turnsOf(snap.events, s), 0);
    const muteTurns = turnsOf(snap.events, 2) + turnsOf(snap.events, 5);
    expect(cost.tokens).toEqual({
      input: talkTurns * TALK.input + muteTurns * MUTE.input,
      cached: talkTurns * TALK.cached,
      thought: talkTurns * TALK.thought + muteTurns * MUTE.thought,
      output: talkTurns * TALK.output,
    });

    // The end screen reads the same figures from the Match's public match_cost event.
    const { byAgent: _byAgent, ...perSeat } = cost;
    expect(latestCost(snap.events)).toEqual(perSeat);
    expect(snap.stats.cost).toBeCloseTo(cost.total, 10);
  });

  it("counts an invalid call's interaction as well as its retry", async () => {
    const agents = Array.from({ length: 7 }, (_, i) =>
      i === 0 ? { ...fakeAgent("fumble", { invalidFirst: true, usage: TALK }), model: "gemini-4-hydrogen" } : talk(`ok-${i + 1}`),
    );
    const snap = await finished(await startMatch({ seed: "usage-retry", agents }));
    // Every turn of seat 1 took two interactions: the rejected call, then the retry.
    expect(snap.result!.cost!.bySeat[1]).toBeCloseTo(2 * turnsOf(snap.events, 1) * TALK_USD, 10);
  });

  it("adds the Narrator's calls to the Match total but to no Agent", async () => {
    const agents = Array.from({ length: 7 }, (_, i) => talk(`n-${i + 1}`));
    const narrator = { id: "fake", options: { inputTokens: 30_000 } };
    const matchId = await startMatch({ seed: "usage-narrator", agents, narrator });
    await finished(matchId);
    // The last narration may land after the result; the Match then publishes an updated cost.
    const { events, cost } = await waitFor(async () => {
      const s = await snapshot(matchId);
      const c = latestCost(s.events);
      const narrations = s.events.filter((e) => e.kind === "drama").length;
      return c && narrations > 0 && Math.abs(c.narrator - narrations * NARRATION_USD) < 1e-9 ? { events: s.events, cost: c } : null;
    });
    const players = [1, 2, 3, 4, 5, 6, 7].reduce((n, s) => n + turnsOf(events, s), 0) * TALK_USD;
    expect(Object.values(cost.bySeat).reduce((a, b) => a + b, 0)).toBeCloseTo(players, 10);
    expect(cost.total).toBeCloseTo(players + cost.narrator, 10);
  });
});

describe("League spend", () => {
  it("totals settled and live Match costs, per Agent, and since the last resume", async () => {
    const roster = [talk("lg-talk"), { ...fakeAgent("lg-cheap", { usage: MUTE }), model: "gemini-3.5-flash-lite" }];
    await admin("config", { n: 1, roster, narrator: null });
    const prior = await league();
    const before = prior.spend;
    const priorIds = prior.recent.map((m) => m.matchId);
    await admin("resume");
    expect((await league()).spend.sinceResume).toBe(0);

    // While a Match runs, its cost so far shows on its tile and counts toward League spend.
    const live = await waitFor(async () => {
      const s = await league();
      const tile = s.tiles.find((t) => (t.summary?.cost ?? 0) > 0);
      return tile ? { s, tile } : null;
    });
    expect(live.s.spend.total).toBeGreaterThanOrEqual(before.total + live.tile.summary!.cost! - 1e-12);

    await waitFor(async () => (await league()).stats.settled >= 1);
    await admin("pause");
    const done = await waitFor(async () => {
      const s = await league();
      return s.tiles.length === 0 ? s : null;
    });

    const matches = done.recent.filter((m) => !priorIds.includes(m.matchId));
    expect(matches.length).toBeGreaterThan(0);
    const costs = await Promise.all(matches.map(async (m) => (await snapshot(m.matchId)).result!.cost!));
    const spent = costs.reduce((a, c) => a + c.total, 0);
    expect(done.spend.total - before.total).toBeCloseTo(spent, 10);
    expect(done.spend.sinceResume).toBeCloseTo(spent, 10);
    for (const agent of ["lg-talk", "lg-cheap"]) {
      const want = costs.reduce((a, c) => a + (c.byAgent[agent] ?? 0), 0);
      expect((done.spend.byAgent[agent] ?? 0) - (before.byAgent[agent] ?? 0), agent).toBeCloseTo(want, 10);
    }
    // The leaderboard shows each Agent's average cost per Match.
    const row = done.leaderboard.rows.find((r) => r.agentId === "lg-talk")!;
    expect(row.costPerMatch).toBeCloseTo(done.spend.byAgent["lg-talk"]! / row.matches, 10);

    // Resuming starts a new "since resume" window.
    await admin("config", { n: 0 });
    await admin("resume");
    const resumed = await league();
    expect(resumed.spend.sinceResume).toBe(0);
    expect(resumed.spend.total).toBeCloseTo(done.spend.total, 10);
    await admin("pause");
  });

  it("pauses the League by itself once total spend reaches the operator's spend cap", async () => {
    const roster = [talk("cap-a"), talk("cap-b")];
    const start = (await league()).spend.total;
    await admin("config", { n: 1, roster, narrator: null, spendCap: start + 0.01 });
    await admin("resume");
    const paused = await waitFor(async () => {
      const s = await league();
      return s.config.paused ? s : null;
    });
    expect(paused.spend.total).toBeGreaterThanOrEqual(start + 0.01);
    expect(paused.config.spendCap).toBeCloseTo(start + 0.01, 10);
    await waitFor(async () => (await league()).tiles.length === 0);
    // Resuming while the cap is still reached starts nothing; raising or clearing the cap allows it.
    const refused = (await admin("resume")) as LeagueSnapshot;
    expect(refused.config.paused).toBe(true);
    expect(refused.blocked).toMatch(/spend cap/i);
    expect(refused.tiles).toHaveLength(0);
    await admin("config", { spendCap: null, n: 0 });
    expect(((await admin("resume")) as LeagueSnapshot).config.paused).toBe(false);
    await admin("pause");
  });
});
