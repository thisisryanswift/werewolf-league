// The Neon Analyst (wl-ofdn) with a scripted Fake Harness, whole system (real League,
// Match and Player DOs and alarms; no model is called): each finished Match gets one
// analysis run after its result is settled, its report becomes one `analysis` event,
// a failed or timed-out run is recorded and never blocks the League, the League caps
// Analyst runs in flight, and the Analyst's cost goes into the Match's, never an Agent's.

import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisEventData } from "../../src/core/analyst";
import { werewolf } from "../../src/rulesets/werewolf";
import type { LeagueSnapshot, MatchEvent } from "../../src/shared/protocol";
import { ADMIN, UNPACED, decisions, fakeAgent, finished, snapshot, startMatch, waitFor } from "./helpers";

const REPORT = {
  summary: "The Werewolves won at parity. The Village never organised.",
  turning_points: [
    { when: "Night 1", what: "The first kill." },
    { when: "Day 1 vote", what: "The Village voted out its own." },
  ],
  mistakes: [{ seat: 2, agent: "a-2", what: "Voted against a Player it had cleared.", evidence: "Day 1 vote: reason 'scripted'." }],
  best_play: { seat: 1, why: "Kept quiet." },
  why_winner_won: "The losing Side's mistakes.",
};

/** A scripted Analyst: files REPORT, but only if its input holds the seats table and the result. */
const fakeAnalyst = (options: Record<string, unknown> = {}) => ({
  harness: "fake",
  options: { delayPolls: 1, pollEveryMs: 20, requireText: ["Result:", "Seats (Display Name", "Secret roles:"], args: { submit_report: REPORT }, ...options },
});

const table = (prefix: string) => Array.from({ length: 7 }, (_, i) => fakeAgent(`${prefix}-${i + 1}`, { delayPolls: 1, pollEveryMs: 100 }));

const analyses = (events: MatchEvent[]) => events.filter((e) => e.kind === "analysis");
const analysisOf = (matchId: string, timeoutMs?: number) =>
  waitFor(async () => {
    const s = await snapshot(matchId);
    return analyses(s.events).length ? s : null;
  }, timeoutMs);

async function league(): Promise<LeagueSnapshot> {
  return (await exports.default.fetch("http://test/api/league")).json();
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

afterEach(async () => {
  await admin("pause");
  await waitFor(async () => (await league()).tiles.length === 0);
  await admin("config", { analyst: null });
});

describe("the Analyst", () => {
  it("analyses a finished Match once, after its result, as one Narrator's-View-only analysis event", async () => {
    const matchId = await startMatch({ seed: "analyst-once", agents: table("a1"), analyst: fakeAnalyst() });
    const snap = await analysisOf(matchId);
    // Give a duplicate run time to show up.
    await new Promise((r) => setTimeout(r, 300));
    const events = (await snapshot(matchId)).events;
    const found = analyses(events);
    expect(found).toHaveLength(1);
    const a = found[0]!;
    expect(a.audience).toEqual([]);
    const data = a.data as unknown as AnalysisEventData;
    expect(data).toMatchObject({ status: "ok", model: "gemini-4-neon", report: REPORT });
    // After the result: match_over and the settlement's rating changes come first.
    const over = events.find((e) => e.kind === "match_over")!;
    expect(a.seq).toBeGreaterThan(over.seq);
    expect(snap.status).toBe("finished");
    // Hidden with Narrator's View off.
    expect(werewolf.view(events, { spectator: true, narratorView: false }).some((e) => e.kind === "analysis")).toBe(false);
  });

  it("never changes the Match or its settlement", async () => {
    const seed = "analyst-isolation";
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`a2-${i + 1}`, { delayPolls: 1, echo: "text" }));
    const plain = await startMatch({ seed, agents });
    const analysed = await startMatch({ seed, agents, analyst: fakeAnalyst() });
    const a = await finished(plain);
    const b = await analysisOf(analysed);
    const game = (ev: MatchEvent[]) => decisions(ev.filter((e) => e.kind !== "analysis" && e.kind !== "match_cost"));
    expect(game(b.events)).toEqual(game(a.events));
    expect(b.result!.winner).toBe(a.result!.winner);
  });

  it("records a failed or timed-out run and skips it", async () => {
    const noReport = await startMatch({ seed: "analyst-no-report", agents: table("a3"), analyst: fakeAnalyst({ script: "no-call" }) });
    // A silent Analyst on a short deadline.
    const hung = await startMatch({ seed: "analyst-hung", agents: table("a5"), analyst: { ...fakeAnalyst({ script: "silent" }), deadlineMs: 200 } });
    const invalid = await startMatch({ seed: "analyst-invalid", agents: table("a6"), analyst: fakeAnalyst({ invalidFirst: true }) });
    const [x, z, w] = await Promise.all([analysisOf(noReport), analysisOf(hung), analysisOf(invalid)]);
    expect(analyses(x.events).map((e) => e.data)).toEqual([expect.objectContaining({ status: "failed", reason: "no_report" })]);
    expect(analyses(z.events).map((e) => e.data)).toEqual([expect.objectContaining({ status: "failed", reason: "timeout" })]);
    // An invalid report is retried with the error, like a Player's invalid call.
    expect(analyses(w.events).map((e) => e.data)).toEqual([expect.objectContaining({ status: "ok", report: REPORT })]);
  });

  it("never blocks the League: failing Analysts free their slots and Matches keep settling", async () => {
    await admin("config", {
      n: 2,
      roster: table("a7"),
      ...UNPACED,
      analystConcurrency: 1,
      analyst: { ...fakeAnalyst({ script: "silent" }), deadlineMs: 100 },
    });
    await admin("resume");
    const s = await waitFor(async () => {
      const l = await league();
      return l.recent.length >= 3 ? l : null;
    }, 25_000);
    await admin("pause");
    // Each settled Match gets its (failed) analysis, one at a time through the single slot.
    for (const m of s.recent.slice(-3)) {
      const snap = await analysisOf(m.matchId, 10_000);
      expect(analyses(snap.events).map((e) => e.data)).toEqual([expect.objectContaining({ status: "failed", reason: "timeout" })]);
    }
  });

  it("keeps at most the configured number of Analyst runs in flight per League", async () => {
    const overlap = async (cap: number, prefix: string) => {
      await admin("config", { analystConcurrency: cap });
      const ids = await Promise.all(
        [1, 2, 3].map((i) => startMatch({ seed: `${prefix}-${i}`, agents: table(`${prefix}${i}`), analyst: fakeAnalyst({ delayPolls: 20 }) })),
      );
      const runs = (await Promise.all(ids.map((id) => analysisOf(id, 25_000)))).map((s) => analyses(s.events)[0]!.data as unknown as AnalysisEventData);
      expect(runs.every((r) => r.status === "ok")).toBe(true);
      // The most runs whose [startedAt, finishedAt] intervals overlap at one moment.
      return Math.max(...runs.map((r) => runs.filter((o) => o.startedAt! <= r.startedAt! && r.startedAt! < o.finishedAt).length));
    };
    expect(await overlap(1, "cap1")).toBe(1);
    expect(await overlap(3, "cap3")).toBeGreaterThan(1);
  });

  it("counts the Analyst's usage in the Match's and League's cost, in no Agent's", async () => {
    // Neon: 20,000 uncached × $3/M + 20,000 cached × $0.15/M + 5,000 out+thought × $15/M = $0.138.
    const usage = { input: 40_000, cached: 20_000, thought: 4_000, output: 1_000 };
    const matchId = await startMatch({ seed: "analyst-cost", agents: table("a8"), analyst: fakeAnalyst({ usage }) });
    const snap = await waitFor(async () => {
      const s = await snapshot(matchId);
      return s.result?.cost?.analyst ? s : null;
    });
    const cost = snap.result!.cost!;
    expect(cost.analyst).toBeCloseTo(0.138, 10);
    expect(cost.total).toBeCloseTo(0.138, 10);
    expect(Object.values(cost.byAgent).every((usd) => usd === 0)).toBe(true);
    const latest = snap.events.filter((e) => e.kind === "match_cost").at(-1)!;
    expect(latest.data.analyst).toBeCloseTo(0.138, 10);
  });
});
