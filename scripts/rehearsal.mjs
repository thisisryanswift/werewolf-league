#!/usr/bin/env node
// Deployed one-table rehearsal with REAL Agents (costs money). Applies the real roster
// with N=1, resumes, and pauses as soon as the one tile appears, so exactly one Match
// runs. Joins that Match's WebSocket mid-way, leaves, rejoins, and checks the merged
// log has no missing or duplicated events. Records time to first public speech and to
// the result, the leaderboard before and after, and checks N=0 starts nothing.
// Always pauses the League on exit.
//
// Usage: [NARRATOR=decisions] node scripts/rehearsal.mjs <baseUrl> [outFile]
// ADMIN_SECRET comes from the environment. Writes the full evidence JSON to outFile.
import { writeFileSync } from "node:fs";
import WebSocket from "ws";
import { realRoster } from "../src/rulesets/werewolf/roster.ts";

const base = process.argv[2]?.replace(/\/+$/, "");
const outFile = process.argv[3] ?? "/tmp/wl-rehearsal.json";
if (!base) throw new Error("usage: node scripts/rehearsal.mjs <baseUrl> [outFile]");
const secret = process.env.ADMIN_SECRET;
if (!secret) throw new Error("set ADMIN_SECRET");
const UA = { "user-agent": "werewolf-league-rehearsal/1" };
const HARD_TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 25 * 60_000);

const t0 = Date.now();
const secs = (t = Date.now()) => ((t - t0) / 1000).toFixed(1);
const log = (...a) => console.log(`[${secs()}s]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (path) => (await fetch(base + path, { headers: UA })).json();
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

/** One Spectator connection: the join log, then live events; seqs must be contiguous. */
function joinMatch(matchId, label) {
  const conn = { label, events: [], problems: [], openedAt: Date.now(), closedAt: null, ws: null };
  const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/matches/${matchId}/ws`, { headers: UA });
  conn.ws = ws;
  const push = (e) => {
    const last = conn.events.at(-1)?.seq ?? 0;
    if (e.seq !== last + 1) conn.problems.push(`${label}: seq ${e.seq} after ${last}`);
    conn.events.push(e);
  };
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "log") msg.events.forEach(push);
    else if (msg.type === "event") push(msg.event);
  });
  ws.on("error", (e) => conn.problems.push(`${label}: ws error ${e.message}`));
  conn.opened = new Promise((r) => ws.once("open", r));
  conn.close = () => {
    conn.closedAt = Date.now();
    ws.close();
  };
  return conn;
}

const evidence = { base, startedAt: new Date(t0).toISOString(), checks: {} };
let exitCode = 0;
const hard = setTimeout(() => {
  log("HARD TIMEOUT");
  exitCode = 2;
  finish().then(() => process.exit(2));
}, HARD_TIMEOUT_MS);

async function finish() {
  try {
    const p = await admin("pause");
    log(`final pause: paused=${p.config.paused}`);
  } catch (e) {
    log(`final pause FAILED: ${e.message}`);
  }
  writeFileSync(outFile, JSON.stringify(evidence, null, 2));
  log(`evidence written to ${outFile}`);
}

try {
  const before = await getJson("/api/league");
  evidence.leaderboardBefore = before.leaderboard;
  evidence.statsBefore = before.stats;
  if (before.tiles.length > 0) throw new Error(`League already has ${before.tiles.length} live Matches; aborting`);

  // League feed, to see the tile appear and the leaderboard message.
  const leagueMsgs = [];
  const lws = new WebSocket(`${base.replace(/^http/, "ws")}/api/league/ws`, { headers: UA });
  lws.on("message", (raw) => leagueMsgs.push({ at: Date.now(), msg: JSON.parse(String(raw)) }));
  await new Promise((r) => lws.once("open", r));

  const body = { n: 1, roster: realRoster() };
  if (process.env.NARRATOR) body.narrator = { id: process.env.NARRATOR };
  const cfg = await admin("config", body);
  log(`config: n=${cfg.config.n} paused=${cfg.config.paused} roster=${cfg.config.roster.map((a) => a.model).join(",")}`);

  const resumedAt = Date.now();
  evidence.resumedAt = resumedAt;
  const res = await admin("resume");
  log(`resumed: paused=${res.config.paused}`);

  // Wait for exactly one tile, then pause so no replacement starts.
  let tile;
  while (!tile) {
    await sleep(250);
    const s = await getJson("/api/league");
    if (s.blocked) log(`blocked: ${s.blocked}`);
    if (s.tiles.length > 1) throw new Error(`n=1 but ${s.tiles.length} tiles`);
    tile = s.tiles[0];
  }
  const p1 = await admin("pause");
  log(`tile ${tile.matchId} appeared; paused=${p1.config.paused} tiles=${p1.tiles.length}`);
  evidence.matchId = tile.matchId;
  evidence.tile = tile;
  evidence.checks.setN1OneTile = p1.tiles.length === 1;
  const matchId = tile.matchId;
  log(`Match page: ${base}/matches/${matchId}`);

  // Join mid-way: wait for the first public speech, then join, stay, leave, rejoin.
  let snap;
  for (;;) {
    snap = await getJson(`/api/matches/${matchId}`);
    if (snap.events?.some((e) => e.kind === "speech" && !e.data.skipped) || snap.status === "finished") break;
    await sleep(2000);
  }
  log(`joining mid-way at seq ${snap.events.length} (status ${snap.status})`);
  const c1 = joinMatch(matchId, "join1");
  await c1.opened;
  await sleep(45_000);
  c1.close();
  log(`left after ${c1.events.length} events`);
  await sleep(30_000);
  const c2 = joinMatch(matchId, "join2");
  await c2.opened;
  log("rejoined");
  for (;;) {
    await sleep(2000);
    const kinds = c2.events.map((e) => e.kind);
    if (kinds.includes("match_over") && kinds.includes("ratings_settled")) break;
  }
  await sleep(3000);
  c2.close();
  lws.close();

  const final = await getJson(`/api/matches/${matchId}`);
  const finalAfter = await getJson("/api/league");
  evidence.final = final;
  evidence.leaderboardAfter = finalAfter.leaderboard;
  evidence.statsAfter = finalAfter.stats;

  // No missing or duplicated events: each connection contiguous from 1; union equals the final log.
  const bySeq = new Map();
  for (const e of [...c1.events, ...c2.events]) bySeq.set(e.seq, e);
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  const sig = (e) => `${e.seq}:${e.kind}:${JSON.stringify(e.data)}`;
  const finalSig = final.events.map(sig).join("\n");
  evidence.checks.seq = {
    join1: { count: c1.events.length, first: c1.events[0]?.seq, last: c1.events.at(-1)?.seq },
    join2: { count: c2.events.length, first: c2.events[0]?.seq, last: c2.events.at(-1)?.seq },
    problems: [...c1.problems, ...c2.problems],
    mergedContiguous: merged.every((e, i) => e.seq === i + 1),
    mergedEqualsFinal: merged.map(sig).join("\n") === finalSig,
    finalCount: final.events.length,
  };
  // Events committed while disconnected must arrive in the rejoin log.
  const gap = final.events.filter((e) => e.ts > c1.closedAt && e.ts < c2.openedAt);
  evidence.checks.seq.committedWhileAway = gap.length;
  evidence.checks.seq.awayEventsInRejoin = gap.every((g) => c2.events.some((e) => e.seq === g.seq));

  const firstSpeech = final.events.find((e) => e.kind === "speech" && !e.data.skipped);
  const over = final.events.find((e) => e.kind === "match_over");
  evidence.timings = {
    firstPublicSpeechS: firstSpeech ? (firstSpeech.ts - resumedAt) / 1000 : null,
    resultS: over ? (over.ts - resumedAt) / 1000 : null,
  };
  evidence.accusations = final.events.filter((e) => e.kind === "speech" && (e.data.accuse?.length ?? 0) > 0).map((e) => e.data);
  evidence.votes = final.events.filter((e) => e.kind === "votes_revealed").map((e) => e.data);
  evidence.ratingsSettled = final.events.find((e) => e.kind === "ratings_settled")?.data ?? null;
  evidence.leaderboardPushes = leagueMsgs.filter((m) => m.msg.type === "leaderboard").map((m) => m.msg.matchId);
  evidence.skippedSpeeches = final.events.filter((e) => e.kind === "speech" && e.data.skipped).length;
  log(`timings: ${JSON.stringify(evidence.timings)}`);
  log(`seq: ${JSON.stringify(evidence.checks.seq)}`);
  log(`winner: ${final.result?.winner}; accusations=${evidence.accusations.length} votes rounds=${evidence.votes.length}`);

  // Pause holds: no replacement started while paused, even with a free slot.
  evidence.checks.pauseHeld = finalAfter.stats.started === evidence.statsBefore.started + 1 && finalAfter.tiles.length === 0;
  // N=0 with the League resumed starts nothing.
  await admin("config", { n: 0 });
  await admin("resume");
  await sleep(10_000);
  const n0 = await getJson("/api/league");
  evidence.checks.n0StartsNothing = n0.tiles.length === 0 && n0.stats.started === finalAfter.stats.started;
  await admin("pause");
  await admin("config", { n: 1 });
  log(`checks: ${JSON.stringify(evidence.checks, (k, v) => (k === "seq" ? undefined : v))}`);
} catch (e) {
  exitCode = 1;
  evidence.error = String(e?.stack ?? e);
  log(`ERROR ${e.message}`);
} finally {
  clearTimeout(hard);
  await finish();
  process.exit(exitCode);
}
