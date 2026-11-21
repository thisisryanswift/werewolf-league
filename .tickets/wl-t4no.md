---
id: wl-t4no
status: open
deps: [wl-nos5, wl-kh5w, wl-lvtw, wl-jb4x]
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

## Acceptance Criteria

- [ ] Deployed app shows live Matches with real Agents
- [ ] At least one real Match finishes and updates the leaderboard
- [ ] No secrets in the repo
- [ ] Mid-Match join, leave and rejoin work on the deployed app with no missing or duplicated events
- [ ] Time to first public speech and time to first result are recorded in a note on this ticket, along with the chosen N and roster
