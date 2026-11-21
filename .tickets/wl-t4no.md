---
id: wl-t4no
status: open
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
