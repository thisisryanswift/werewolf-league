#!/usr/bin/env node
// Local design-review setup for the League grid (wl-gtil) against `wrangler dev`:
// configure a fast fake League of N Matches (fake roster, no Gemini calls), and
// resume it. Optionally turn on the scripted fake Narrator so tiles get Drama
// Scores and Drama Flags.
//
// Usage: node scripts/demo-grid.mjs [baseUrl]
//   N=36           live Matches (1-36)
//   NARRATOR=fake  fake Narrator with varying Drama Scores (default); NARRATOR=off for none
//   PAUSE=1        pause the League instead
//   LEAGUE=pi-open which League (default gemini-managed)
// ADMIN_SECRET comes from the environment, or else from .dev.vars. It is never printed.
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
// LEAGUE=<id> picks a League (e.g. pi-open); unset uses the single-League routes, which are gemini-managed.
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

async function admin(op, body = {}) {
  const res = await fetch(`${base}${ADMIN_PATH}/${op}`, {
    method: "POST",
    headers: { "x-admin-secret": secret, "content-type": "application/json", "user-agent": "werewolf-league-demo/1.0" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${op}: ${res.status} ${text}`);
  return JSON.parse(text);
}

if (process.env.PAUSE) {
  await admin("pause");
  console.log("League paused");
  process.exit(0);
}

const n = Number(process.env.N ?? 36);
// Scores per Narrator call; Matches are at different points, so tiles differ.
const scores = [0.15, 0.3, 0.22, 0.48, 0.35, 0.62, 0.41, 0.78, 0.55, 0.9, 0.33, 0.7, 0.5, 0.85, 0.27, 0.95];
const narrator =
  process.env.NARRATOR === "off"
    ? null
    : { id: "fake", threshold: 0.5, options: { scores, flags: { claim_war: 0.8, knife_edge_vote: 0.3, wolf_fooling_table: 0.9 } } };
await admin("config", { n, startsPerWindow: n, startWindowMs: 1000, narrator });
await admin("resume");
console.log(`League resumed: n=${n}, fast starts, narrator=${narrator ? "fake" : "off"}. Open ${base}/`);
