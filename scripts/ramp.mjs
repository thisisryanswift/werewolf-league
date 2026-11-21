#!/usr/bin/env node
// Deployed ramp test with REAL Agents (costs money). Steps N up (STEPS, default
// 4,8,12,16,24,36), holding each step HOLD_MIN minutes, while measured League spend
// stays under the budget. Per step it records N, 429 reports, step latency p50/p90
// (turn_started -> step_resolved, i.e. the slowest seat), timeouts, measured spend
// and $/Match. Stops early on the budget, repeated 429 backoffs or rising timeouts.
// Always pauses the League on exit.
//
// Usage: BUDGET_USD=50 [STEPS=4,8] [HOLD_MIN=6] node scripts/ramp.mjs <baseUrl> [outFile]
// ADMIN_SECRET comes from the environment. Writes the evidence JSON to outFile.
import { writeFileSync } from "node:fs";

const base = process.argv[2]?.replace(/\/+$/, "");
const outFile = process.argv[3] ?? "/tmp/wl-ramp.json";
if (!base) throw new Error("usage: node scripts/ramp.mjs <baseUrl> [outFile]");
const secret = process.env.ADMIN_SECRET;
if (!secret) throw new Error("set ADMIN_SECRET");
const BUDGET = Number(process.env.BUDGET_USD ?? 50);
const STEPS = (process.env.STEPS ?? "4,8,12,16,24,36").split(",").map(Number);
const HOLD_MS = Number(process.env.HOLD_MIN ?? 6) * 60_000;
const POLL_MS = 15_000;
/** Cost of one Match (USD): starts at LIVE_MATCH_USD, then the measured mean of finished Matches. */
let matchUsd = Number(process.env.LIVE_MATCH_USD ?? 0.6);
/** Matches one table runs over a hold (a Match takes ~3.5 min), plus the one still live at the end. */
const matchesPerTable = HOLD_MS / 60_000 / 3.5 + 1;
const UA = { "user-agent": "werewolf-league-rehearsal/1" };

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(path) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(base + path, { headers: UA });
      if (res.ok) return await res.json();
      if (i >= 3) throw new Error(`${path}: ${res.status}`);
    } catch (e) {
      if (i >= 3) throw e;
    }
    await sleep(2000);
  }
}
async function admin(op, body = {}) {
  const res = await fetch(`${base}/api/admin/league/${op}`, {
    method: "POST",
    headers: { ...UA, "x-admin-secret": secret, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(`${op} failed: ${res.status} ${JSON.stringify(out)}`);
  return out.league ?? out;
}
const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
};

/** Step latencies (s), timeouts and skipped speeches in a Match log, limited to [from, to). */
function analyze(events, from, to) {
  const start = new Map();
  const lat = [];
  let timeouts = 0;
  let skipped = 0;
  for (const e of events) {
    if (e.ts < from || e.ts >= to) continue;
    if (e.kind === "turn_started" && !start.has(e.data.step)) start.set(e.data.step, e.ts);
    if (e.kind === "step_resolved" && start.has(e.data.step)) lat.push((e.ts - start.get(e.data.step)) / 1000);
    if (e.kind === "turn_timed_out") timeouts++;
    if (e.kind === "speech" && e.data.skipped) skipped++;
  }
  return { lat, timeouts, skipped };
}

const startSnap = await getJson("/api/league");
const startSpend = startSnap.spend.total;
const budgetEnd = startSpend + BUDGET;
const evidence = { base, startedAt: new Date(t0).toISOString(), startSpend, budgetEnd, steps: [], polls: [], anomalies: [] };
let stopReason = null;
const seenMatches = new Set();

async function finish() {
  try {
    const p = await admin("pause");
    log(`final pause: paused=${p.config.paused}`);
  } catch (e) {
    log(`final pause FAILED: ${e.message}`);
  }
  writeFileSync(outFile, JSON.stringify(evidence, null, 2));
}
process.on("SIGINT", async () => {
  stopReason = "interrupted";
  await finish();
  process.exit(130);
});

try {
  if (startSnap.tiles.length > 0) throw new Error(`League already has ${startSnap.tiles.length} live Matches`);
  // The League's own cap backs ours up: it pauses itself at the budget.
  await admin("config", { spendCap: Number(budgetEnd.toFixed(2)), n: STEPS[0] });
  log(`start spend $${startSpend.toFixed(3)}; budget end $${budgetEnd.toFixed(2)}; steps ${STEPS.join(",")}; hold ${HOLD_MS / 60000} min`);
  await admin("resume");

  for (const n of STEPS) {
    const snap0 = await getJson("/api/league");
    // Don't step up if this step's live Matches alone could run past the budget.
    const projected = snap0.spend.total + n * matchUsd * matchesPerTable;
    if (projected > budgetEnd) {
      stopReason = `budget: step N=${n} projects $${projected.toFixed(2)} > $${budgetEnd.toFixed(2)}`;
      break;
    }
    const cfg = await admin("config", { n });
    if (cfg.config.paused) await admin("resume");
    const from = Date.now();
    const step = {
      n,
      from,
      spend0: snap0.spend.total,
      rl0: snap0.rateLimit.count,
      settled0: snap0.stats.settled,
      started0: snap0.stats.started,
      maxTiles: 0,
      backoffPolls: 0,
      matchIds: new Set(),
    };
    log(`STEP N=${n} spend $${snap0.spend.total.toFixed(3)}`);
    while (Date.now() - from < HOLD_MS) {
      await sleep(POLL_MS);
      const s = await getJson("/api/league");
      for (const t of s.tiles) {
        step.matchIds.add(t.matchId);
        seenMatches.add(t.matchId);
      }
      for (const r of s.recent) if (r.settledAt >= from) step.matchIds.add(r.matchId);
      step.maxTiles = Math.max(step.maxTiles, s.tiles.length);
      if (s.rateLimit.backoffUntil) step.backoffPolls++;
      const poll = {
        at: Date.now(),
        n,
        tiles: s.tiles.length,
        paused: s.config.paused,
        spend: s.spend.total,
        rl: s.rateLimit.count,
        backoff: !!s.rateLimit.backoffUntil,
        started: s.stats.started,
        settled: s.stats.settled,
        blocked: s.blocked,
      };
      evidence.polls.push(poll);
      log(`N=${n} tiles=${poll.tiles} started=${poll.started} settled=${poll.settled} spend=$${poll.spend.toFixed(3)} 429s=${poll.rl}${poll.backoff ? " BACKOFF" : ""}${poll.blocked ? ` blocked=${poll.blocked}` : ""}${poll.paused ? " PAUSED" : ""}`);
      if (s.config.paused) {
        stopReason = `League paused itself (spend $${s.spend.total.toFixed(2)}, cap ${s.config.spendCap})`;
        break;
      }
      if (s.spend.total + s.tiles.length * matchUsd > budgetEnd) {
        stopReason = `budget: spend $${s.spend.total.toFixed(2)} + ${s.tiles.length} live Matches nears $${budgetEnd.toFixed(2)}`;
        break;
      }
      if (step.backoffPolls >= 3 && s.rateLimit.count - step.rl0 >= 3) {
        stopReason = `repeated 429 backoffs at N=${n}`;
        break;
      }
    }
    step.to = Date.now();
    const snap1 = await getJson("/api/league");
    step.spend1 = snap1.spend.total;
    step.rl1 = snap1.rateLimit.count;
    step.settled1 = snap1.stats.settled;
    step.started1 = snap1.stats.started;
    step.rateLimitRecent = snap1.rateLimit.recent.filter((r) => (r.at ?? 0) >= from);
    evidence.steps.push(step);
    // Timeouts rising: stop before the next step.
    const a = await analyzeStep(step);
    if (a.finishedMatchCostMean) matchUsd = a.finishedMatchCostMean;
    log(`STEP N=${n} done: ${JSON.stringify(a)}`);
    if (a.timeouts > 0 && a.timeoutRate > 0.05) stopReason = stopReason ?? `timeouts rising at N=${n} (${a.timeouts})`;
    if (stopReason) break;
  }
} catch (e) {
  stopReason = `error: ${e.message}`;
  evidence.error = String(e?.stack ?? e);
}
log(`STOP: ${stopReason ?? "all steps done"}`);
evidence.stopReason = stopReason;
await admin("pause").catch((e) => log(`pause failed: ${e.message}`));

// Let the live Matches finish so their spend and logs are complete.
for (let i = 0; i < 40; i++) {
  const s = await getJson("/api/league");
  log(`draining: tiles=${s.tiles.length} spend=$${s.spend.total.toFixed(3)}`);
  if (s.tiles.length === 0) break;
  await sleep(POLL_MS);
}
const end = await getJson("/api/league");
evidence.endSpend = end.spend.total;
evidence.endStats = end.stats;
evidence.endRateLimit = end.rateLimit;
evidence.byAgent = end.spend.byAgent;
evidence.leaderboard = end.leaderboard.rows.map((r) => ({ name: r.name, overall: r.overall, matches: r.matches, timeouts: r.timeouts, calibration: r.calibration }));
for (const step of evidence.steps) {
  step.summary = await analyzeStep(step);
  step.matchIds = [...step.matchIds];
}
log("SUMMARY");
for (const s of evidence.steps) log(JSON.stringify({ n: s.n, ...s.summary }));
log(`total measured ramp spend $${(evidence.endSpend - startSpend).toFixed(3)} (League total $${evidence.endSpend.toFixed(3)})`);
await finish();

async function analyzeStep(step) {
  const lat = [];
  let timeouts = 0;
  let skipped = 0;
  let turns = 0;
  const costs = [];
  for (const id of step.matchIds) {
    const m = await getJson(`/api/matches/${id}`).catch(() => null);
    if (!m?.events) continue;
    const a = analyze(m.events, step.from, step.to);
    lat.push(...a.lat);
    timeouts += a.timeouts;
    skipped += a.skipped;
    turns += m.events.filter((e) => e.kind === "turn_started" && e.ts >= step.from && e.ts < step.to).length;
    if (a.timeouts > 0) evidence.anomalies.push({ matchId: id, n: step.n, timeouts: a.timeouts, skipped: a.skipped });
    const c = m.result?.cost?.total ?? m.events.find((e) => e.kind === "match_cost")?.data?.total;
    if (m.status === "finished" && typeof c === "number") costs.push(c);
  }
  const spend = (step.spend1 ?? step.spend0) - step.spend0;
  return {
    matchesSeen: step.matchIds.size ?? step.matchIds.length,
    maxTiles: step.maxTiles,
    started: (step.started1 ?? step.started0) - step.started0,
    settled: (step.settled1 ?? step.settled0) - step.settled0,
    r429: (step.rl1 ?? step.rl0) - step.rl0,
    backoffPolls: step.backoffPolls,
    steps: lat.length,
    p50: pct(lat, 0.5),
    p90: pct(lat, 0.9),
    max: lat.length ? Math.max(...lat) : null,
    turns,
    timeouts,
    timeoutRate: turns ? timeouts / turns : 0,
    skippedSpeeches: skipped,
    spendDelta: Number(spend.toFixed(3)),
    finishedMatchCostMean: costs.length ? Number((costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(3)) : null,
    finishedMatchCosts: costs.length,
  };
}
