#!/usr/bin/env node
// Local smoke check against `wrangler dev`: run the League with the fake roster,
// watch the League WebSocket, and verify that tiles update live, that a finished
// Match is replaced, and that each tile's Match page and Match API exist. Pauses
// the League at the end.
//
// Usage: node scripts/watch-league.mjs [baseUrl]
// ADMIN_SECRET comes from the environment, or else from .dev.vars.
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
// LEAGUE=<id> picks a League (e.g. pi-open); unset uses the single-League routes, which are gemini-managed.
const LEAGUE_PATH = process.env.LEAGUE ? `/api/leagues/${process.env.LEAGUE}` : "/api/league";
const ADMIN_PATH = process.env.LEAGUE ? `/api/admin/leagues/${process.env.LEAGUE}` : "/api/admin/league";
function devVarsSecret() {
  try {
    return /^ADMIN_SECRET=(.*)$/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}
const secret = process.env.ADMIN_SECRET ?? devVarsSecret();
if (!secret) throw new Error("set ADMIN_SECRET (see .dev.vars)");
const UA = "werewolf-league-smoke/1.0";
const N = Number(process.env.N ?? 3);

async function admin(op, body = {}, key = secret) {
  const res = await fetch(`${base}${ADMIN_PATH}/${op}`, {
    method: "POST",
    headers: { "x-admin-secret": key, "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

console.log(`admin without secret: ${(await admin("resume", {}, "wrong")).status}`);

const ws = new WebSocket(`${base.replace(/^http/, "ws")}${LEAGUE_PATH}/ws`, { headers: { "user-agent": UA } });
const snapshots = [];
// Fold a coalesced "tiles" diff into the snapshot (same as applyLeagueDiff in src/shared/league-feed.ts).
function fold(prev, msg) {
  const tiles = new Map(prev.tiles.map((t) => [t.matchId, t]));
  for (const id of msg.removed) tiles.delete(id);
  for (const d of msg.tiles) {
    const old = tiles.get(d.matchId);
    const { summary, ...rest } = d;
    const next = old ? { ...old, ...rest } : d;
    if (old && summary !== undefined) next.summary = summary === null ? null : { ...(old.summary ?? {}), ...summary };
    tiles.set(d.matchId, next);
  }
  return { ...prev, ...msg.league, tiles: [...tiles.values()].sort((a, b) => a.startedAt - b.startedAt) };
}
ws.on("message", (raw) => {
  const msg = JSON.parse(String(raw));
  let league;
  if (msg.type === "league") league = msg.league;
  else if (msg.type === "tiles" && snapshots.length) league = fold(snapshots.at(-1), msg);
  else return;
  snapshots.push(league);
  const tiles = league.tiles
    .map((t) => `${t.matchId.slice(0, 8)}:${t.summary ? `${t.summary.phase} ${t.summary.round} alive=${t.summary.alive.length}` : t.status}`)
    .join(" | ");
  console.log(`feed #${snapshots.length} ${msg.type} paused=${league.config.paused} settled=${league.stats.settled} ${tiles}`);
});
await new Promise((r) => ws.once("open", r));

const configured = await admin("config", { n: N });
console.log(`config n=${N}: ${configured.status}`);
console.log(`resume: ${(await admin("resume")).status}`);

// Wait for a Match to finish and be replaced.
const firstIds = new Set();
for (;;) {
  await new Promise((r) => setTimeout(r, 500));
  const last = snapshots.at(-1);
  if (!last) continue;
  if (firstIds.size === 0 && last.tiles.length === N) last.tiles.forEach((t) => firstIds.add(t.matchId));
  if (firstIds.size && last.stats.settled > 0 && last.tiles.some((t) => !firstIds.has(t.matchId))) break;
}
const last = snapshots.at(-1);
const replaced = last.tiles.find((t) => !firstIds.has(t.matchId));
console.log(`replacement started: ${replaced.matchId} (tiles=${last.tiles.length}, settled=${last.stats.settled})`);

for (const t of last.tiles) {
  const page = await fetch(`${base}/matches/${t.matchId}`, { headers: { "user-agent": UA } });
  const api = await fetch(`${base}/api/matches/${t.matchId}`, { headers: { "user-agent": UA } });
  const snap = await api.json();
  console.log(`tile ${t.matchId}: page ${page.status} (${(await page.text()).includes('id="root"') ? "app shell" : "?"}), api ${api.status} status=${snap.status}`);
}
const phases = new Set(snapshots.flatMap((s) => s.tiles.map((t) => t.summary && `${t.summary.phase} ${t.summary.round}`)).filter(Boolean));
console.log(`distinct tile phases seen live: ${[...phases].join(", ")}`);
console.log(`summary: feed_messages=${snapshots.length} replaced=${Boolean(replaced)}`);

if (!process.env.KEEP_RUNNING) {
  console.log(`pause: ${(await admin("pause")).status}`);
}
ws.close();
