#!/usr/bin/env node
// Local smoke check against `wrangler dev`: start a fake Match through the admin
// endpoint, wait until it is mid-Match, join its WebSocket, and verify that the
// full log arrives first and live events follow, each seq exactly once.
//
// Usage: node scripts/watch-fake-match.mjs [baseUrl]
// ADMIN_SECRET comes from the environment, or else from .dev.vars.
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
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

const res = await fetch(`${base}/api/admin/matches`, {
  method: "POST",
  headers: { "x-admin-secret": secret, "content-type": "application/json", "user-agent": UA },
  body: JSON.stringify({ seed: process.env.SEED ?? `smoke-${Date.now()}` }),
});
if (res.status !== 201) throw new Error(`start failed: ${res.status} ${await res.text()}`);
const { matchId } = await res.json();
console.log(`started match ${matchId}`);
console.log(`Match page: ${base}/matches/${matchId}`);

// Wait until Night 1 has resolved, so we join mid-Match.
for (;;) {
  const snap = await (await fetch(`${base}/api/matches/${matchId}`, { headers: { "user-agent": UA } })).json();
  if (snap.events.some((e) => e.kind === "night_passed")) {
    console.log(`joining mid-Match: status=${snap.status}, ${snap.events.length} events so far`);
    break;
  }
  await new Promise((r) => setTimeout(r, 200));
}

const ws = new WebSocket(`${base.replace(/^http/, "ws")}/api/matches/${matchId}/ws`, { headers: { "user-agent": UA } });
const seqs = [];
let logCount = 0;
let liveCount = 0;
await new Promise((resolve, reject) => {
  ws.on("error", reject);
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "log") {
      logCount = msg.events.length;
      seqs.push(...msg.events.map((e) => e.seq));
      console.log(`log: ${logCount} events (seq ${msg.events[0]?.seq}..${msg.events.at(-1)?.seq})`);
    } else {
      liveCount++;
      seqs.push(msg.event.seq);
      console.log(`live: #${msg.event.seq} ${msg.event.kind} ${JSON.stringify(msg.event.data)}`);
      if (msg.event.kind === "match_over") resolve();
    }
  });
});
ws.close();

const contiguous = seqs.every((s, i) => s === i + 1);
console.log(`summary: log=${logCount} live=${liveCount} total=${seqs.length} contiguous_exactly_once=${contiguous}`);
if (!contiguous || logCount === 0 || liveCount === 0) process.exit(1);
