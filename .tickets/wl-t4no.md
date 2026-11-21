---
id: wl-t4no
status: in_progress
deps: [wl-nos5, wl-kh5w, wl-lvtw, wl-jb4x, wl-cizy, wl-e9tp]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Deployed rehearsal (release gate, ~14:00)

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Real roster in config (Hydrogen, 3.6 Flash, 3.5 Flash-Lite, plus 3.8 Flash if M1 kept it) with shared Agent Instructions; Gemini key and admin secret as Wrangler secrets; deploy to workers.dev; run a deployed one-table rehearsal. Join a real Match mid-way, see a real Accusation and a vote with reasons, leave and rejoin, then watch the result change the leaderboard. Measure time to first public speech and time to first Match result, and use them to choose N and the final roster. Target ~14:00; this is the release gate. Scripts calling the Worker send an explicit User-Agent.

**Revised 2026-11-21 (scale):** Add a ramp test. Start at a small N (e.g. 4), then step up (e.g. 8, 12, 16, 24, and 36 if healthy), holding each step long enough to see steady-state turns. At each step, watch for 429s, turn latency (p50/p90) and timeouts. Choose the demo N and a fallback N from the results. Set-N and pause/resume are demo-critical, so verify both on the deployed app.

## Acceptance Criteria

- [ ] Deployed app shows live Matches with real Agents
- [ ] At least one real Match finishes and updates the leaderboard
- [ ] No secrets in the repo
- [ ] Mid-Match join, leave and rejoin work on the deployed app with no missing or duplicated events
- [ ] Time to first public speech and time to first result are recorded in a note on this ticket, along with the chosen N and roster
- [ ] Ramp test recorded in a note on this ticket: N steps, 429 count, turn latency p50/p90 and timeouts per step, plus the chosen demo N and fallback N
- [ ] Set-N and pause/resume verified on the deployed app

## Notes

**2026-11-21T16:43:58Z**

Human decision 2026-11-21: cap ramp-test Gemini spend at $50 total. Step N up (4 → 8 → 12 → 16 → 24 → 36 if healthy) only while the estimated cumulative spend stays under $50, using the spec's $1–1.5/Match fast-roster estimate and measured Match completions; stop the ramp and pause the League when the cap is reached.
- [ ] Agent behaviour checked on real Matches, with findings in a note: Flash speeches within ~350 characters with no markdown; whether /notes.md writes push turns past the deadline (if so, cut Notes from the instructions); Werewolves not putting their partner at 1 in their beliefs; Agents following the mounted AGENTS.md

**2026-11-21T16:56:27Z**

Progress (orchestrator, 11:56): deployed to https://werewolf-league.rswift.workers.dev (version 99a8b20a, built from impl/wl-t4no 0ef0c4e). GEMINI_API_KEY and ADMIN_SECRET are set as Wrangler secrets; ADMIN_SECRET is also in the main checkout's gitignored .dev.vars. The League is paused on the fake roster with 0 Matches started. The real roster (hydrogen, flash-3-8, flash-3-6, flash-lite-3-5) is in src/rulesets/werewolf/roster.ts with scripts/apply-roster.mjs. ON HOLD until wl-cizy and wl-e9tp land. codex review on impl/wl-t4no: P1, every seat gets every role section (resolved by wl-cizy's per-role assembly; re-check after it merges); P2, N=36 is refused by MAX_LIVE_MATCHES=24 (asked wl-d5wn to allow 36); P2, apply-roster.mjs breaks on a base URL with a trailing slash (fix before the rehearsal). Operator caution: never resume on the fake roster, because fake Agents would stay on the leaderboard and there is no reset route.
