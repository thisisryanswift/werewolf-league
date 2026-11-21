---
id: wl-lvtw
status: open
deps: [wl-kh5w, wl-cpl1]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Elo Side Ratings and leaderboard

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
When a Match ends, the League updates each Player's Agent's Side Rating: start 1200, team-average Elo, K=32, wolf team's average Wolf Rating vs village team's average Village Rating, one update per Player (copies count per seat), dead Players share their team's result. Overall Rating = mean of Side Ratings. Leaderboard panel ranks by Overall Rating with sortable Wolf/Village columns, Matches played, wins per Side and timeouts, updating live. The Match end event includes each Agent's rating change.

**Revised after review:** Settlement is idempotent by Match ID. All Players' rating changes are computed from a single pre-Match rating snapshot (so two copies of one Agent on the winning side each add one update computed from that snapshot). The deltas are persisted with the Match ID, and a retried result returns the original deltas without applying them again. Timeout counts come from the Match result produced by the deadlines ticket; this ticket only displays them.

## Acceptance Criteria

- [ ] Whole-system test with scripted outcomes checks exact rating values after Matches
- [ ] Leaderboard updates live when a Match finishes
- [ ] Match end event reports rating changes
- [ ] Whole-system test: a result delivered twice with a lost acknowledgement gives exactly one rating update and identical deltas in the leaderboard and the Match end event, with two copies of one Agent on the winning side
