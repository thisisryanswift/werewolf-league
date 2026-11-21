---
id: wl-2lfo
status: open
deps: [wl-gtil, wl-d5wn, wl-64dn, wl-ks6l]
links: []
created: 2026-11-21T18:22:17Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Multiple Leagues: Gemini Managed and Pi Open Models

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002, docs/adr/0003.

## What to build
Support several Leagues, each a League DO with its own id, roster, config, Side Ratings, spend and admin controls.
- **Two seeded Leagues:**
  - gemini-managed: the current Managed Agent roster, and the default League.
  - pi-open: Agents on the pi Harness; empty and paused until wl-zst1 lands.
- **Routing:** League routes take a League id (League snapshot, League WebSocket, admin pause/resume/set-N/config, spend). The grid has a League switcher (URL carries ?league=<id>; default gemini-managed).
- **Matches** record their League id and settle ratings, Calibration, timeouts and cost to that League only.
- **Leaderboard** and the header leaderboard strip are per League.
- **Elo** stays within a League; ratings are never compared across Leagues (cross-League comparison is wl-9u76's absolute metrics).
- **No behaviour change** for a single League beyond the id.

## Acceptance Criteria

- [ ] Whole-system test: two Leagues run Matches concurrently; each Match settles ratings and spend only to its own League; pausing one doesn't affect the other
- [ ] Admin operations are per League and still require the secret
- [ ] Grid League switcher works and the URL carries the League; the default is gemini-managed
- [ ] Existing single-League tests pass unchanged against the default League

