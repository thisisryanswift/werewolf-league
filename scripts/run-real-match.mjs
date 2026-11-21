#!/usr/bin/env node
// Manual smoke test against `wrangler dev` with REAL Gemini Managed Agents (costs money;
// never run in CI). Starts one 7-seat Match on the managed-agent harness and follows its
// event log to the result, printing timings. The Worker reads GEMINI_API_KEY from
// .dev.vars; this script only needs ADMIN_SECRET and never sees or prints the key.
//
// Usage: node scripts/run-real-match.mjs [baseUrl]   (MODEL=gemini-4-hydrogen by default)
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:8787";
const model = process.env.MODEL ?? "gemini-4-hydrogen";
function devVarsSecret() {
  try {
    return /^ADMIN_SECRET=(.*)$/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}
const secret = process.env.ADMIN_SECRET ?? devVarsSecret();
if (!secret) throw new Error("set ADMIN_SECRET (see .dev.vars)");
const UA = "werewolf-league-real-smoke/1.0";

const INSTRUCTIONS =
  "Play to win for your Side. Read every observation carefully, reason about who is lying, " +
  "and always answer with exactly the tool call the game asks for.";
// Two Agents on the same model, so the dealer can put the Werewolves on different Agents.
const agents = Array.from({ length: 7 }, (_, i) =>
  i % 2 === 0
    ? { id: "hydrogen-a", name: "Hydrogen A", harness: "managed-agent", model, instructions: INSTRUCTIONS }
    : { id: "hydrogen-b", name: "Hydrogen B", harness: "managed-agent", model, instructions: INSTRUCTIONS },
);

const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
const res = await fetch(`${base}/api/admin/matches`, {
  method: "POST",
  headers: { "x-admin-secret": secret, "content-type": "application/json", "user-agent": UA },
  body: JSON.stringify({ matchId: process.env.MATCH_ID, seed: process.env.SEED ?? `real-${Date.now()}`, agents }),
});
if (res.status !== 201) throw new Error(`start failed: ${res.status} ${await res.text()}`);
const { matchId } = await res.json();
console.log(`[${secs()}s] started match ${matchId} (provisioning included)`);
console.log(`Match page: ${base}/matches/${matchId}`);

let seen = 0;
let firstAction = null;
const SETUP = new Set(["match_setup", "role_assigned", "wolf_team", "phase_started"]);
for (;;) {
  const snap = await (await fetch(`${base}/api/matches/${matchId}`, { headers: { "user-agent": UA } })).json();
  for (const e of snap.events.slice(seen)) {
    if (!firstAction && !SETUP.has(e.kind)) {
      firstAction = secs();
      console.log(`[${firstAction}s] first resolved action`);
    }
    console.log(`[${secs()}s] #${e.seq} ${e.kind} ${JSON.stringify(e.data)}`);
  }
  seen = snap.events.length;
  if (snap.status === "finished") {
    console.log(`[${secs()}s] RESULT winner=${snap.result.winner} first_action_s=${firstAction} result_s=${secs()}`);
    break;
  }
  if (Date.now() - t0 > 45 * 60_000) throw new Error("gave up after 45 min");
  await new Promise((r) => setTimeout(r, 2000));
}
