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

**2026-11-21T17:03:42Z**

Pre-rehearsal real local Match (orchestrator-run smoke on integration @ d8ac2bf, wrangler dev). Match eaf83678-0ce1-4b94-9481-4ecafd9d6716, seed smoke-hyd-flash-20261121, 7 seats alternating hydrogen (gemini-4-hydrogen; seats 1,3,5,7) and flash-3-6 (gemini-3.6-flash; seats 2,4,6), instructions sent in the first turn.
- Tool schemas: all six accepted by the real API (wolf_chat x8, inspect x1, choose_kill x4, protect x2, speak x14, vote x6). No 4xx/5xx, no schema rejections, no harness errors. Invalid or out-of-phase calls can't be counted, because the Player DO retries silently with no log line or event (observability gap).
- Timeouts: none.
- Timing: first non-skipped speech at 43.1 s; match_over at 123.3 s, wolf win by parity after N1, D1, N2. Step latency (turn_started to step_resolved, i.e. the slowest seat) over 11 steps: p50 9.7 s, p90 16.6 s, max 19.4 s (D1 vote).
- Speeches: every one was 3 sentences and 240-330 chars, within limits. accuse was used in 5/6 Round B speeches and both replies, defend never, claim once. Round A speeches were near-identical (all about losing the Seer). One vote reason was confused by simultaneous speech ('piggybacking on a simultaneous round').
- ODD 1: model names leak to Players. Seat labels are '<Agent name> #n' and Agents quote them ('I accuse Hydrogen #3'). wl-e9tp (Display Names) fixes this; the rehearsal must not run before it lands.
- ODD 2: beliefs_recorded stores only normalized ballots, so raw sums and genuinely uniform vs empty/zero ballots can't be told apart. Two ballots were uniform (seat 7 wolf all 0.2; seat 5 all 0.4). Normalized sums were correct (2.0 village, 1.0 wolf W-1). No self-ratings, no missing seats, nothing over 1. Wolf 4 rated its partner lowest (0.125).
Artifacts: /tmp/wl-smoke/ (events.json, wrangler.log, analyze.mjs).

**2026-11-21T17:19:27Z**

ONE-TABLE REHEARSAL PASSED on the deployed app (https://werewolf-league.rswift.workers.dev, version 1f2c7abb, built from impl/wl-t4no 5bb9a5a). Match 1c1ac7f6-860a-40b8-a381-5964d59e4dd0 with the real roster (Hydrogen x1, 3.6 Flash x1, 3.5 Flash-Lite x1, 3.8 Flash x4) and the Narrator (decisions) on.
- Real Agents: all six tools ran on the real API. wrangler tail (/tmp/wl-t4no/tail.jsonl): 493 invocations, no exceptions. All 14 speeches had text, 0 timeouts.
- Result and leaderboard: wolf win by parity on N2. One ratings_settled event and one leaderboard push. Leaderboard after: 3.6 Flash 1208, Flash-Lite 1192, Hydrogen 1192, 3.8 Flash 1184; Calibration shown (Flash-Lite 0.291, 3.8 Flash 0.246). The featured link points to this Match.
- Join/leave/rejoin: joined at seq 58 (log 1..77), left, rejoined 30 s later (1..120). Contiguous, no duplicates or gaps; the merged log equals GET /api/matches/:id.
- TIMINGS (from resume): time to first public speech 63.8 s; time to result 200.8 s (~3.3 min). Step p50 13.2 s, p90 26.9 s, max 41.9 s (vote, 6 voters).
- Set-N and pause/resume on the deployed app: N=1 gave exactly 1 tile; paused, the Match finished with no replacement; N=0 resumed for 10 s started nothing; a wrong secret got 401. The League is now PAUSED, N=1.
- No secrets in the repo. No model names in any speech or Wolf Chat. Display Names showed on the deployed Match page ('Wren · 3.5 Flash-Lite'). Player-input hiding is covered by wl-e9tp's tests.
- Behaviour: speeches 179-326 chars; wolves rated their partners low (0.15/0.05); every vote had a reason; 7 Accusations, Right of Reply worked; the Narrator emitted 11 drama and 11 drama_secret events. Oddity: the Doctor (Flash-Lite) protected a wolf on N1.
- Fixes on the branch: realRoster() carries no instructions, so the per-role Ruleset default is mounted (codex P1 resolved); apply-roster.mjs normalizes a trailing slash (P2); new scripts/rehearsal.mjs.
Pending: the ramp test, then the chosen demo N and fallback N. Suggested roster: keep all four Agents. Evidence: /tmp/wl-t4no/rehearsal1.{json,log}.
