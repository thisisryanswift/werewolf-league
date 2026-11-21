#!/usr/bin/env node
// Operator script: apply the real roster (src/rulesets/werewolf/roster.ts, with the shared
// Agent Instructions from docs/agent-instructions/werewolf.md) to a League. It only
// changes the roster (plus N if N is set); it never resumes the League.
//
// Usage: [N=1] node scripts/apply-roster.mjs <baseUrl>
// ADMIN_SECRET comes from the environment, or else from .dev.vars.
import { readFileSync } from "node:fs";
import { realRoster } from "../src/rulesets/werewolf/roster.ts";

const base = process.argv[2];
if (!base) throw new Error("usage: node scripts/apply-roster.mjs <baseUrl>");
function devVarsSecret() {
  try {
    return /^ADMIN_SECRET=(.*)$/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"))?.[1]?.trim();
  } catch {
    return undefined;
  }
}
const secret = process.env.ADMIN_SECRET ?? devVarsSecret();
if (!secret) throw new Error("set ADMIN_SECRET (see .dev.vars)");

const roster = realRoster(readFileSync(new URL("../docs/agent-instructions/werewolf.md", import.meta.url), "utf8"));
const body = { roster, ...(process.env.N !== undefined ? { n: Number(process.env.N) } : {}) };
const res = await fetch(`${base}/api/admin/league/config`, {
  method: "POST",
  headers: { "x-admin-secret": secret, "content-type": "application/json", "user-agent": "werewolf-league-rehearsal/1" },
  body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok) throw new Error(`config failed: ${res.status} ${JSON.stringify(out)}`);
const c = out.league?.config ?? out.config;
console.log(`applied: n=${c?.n} paused=${c?.paused} roster=${c?.roster?.map((a) => `${a.name}(${a.model})`).join(", ")}`);
