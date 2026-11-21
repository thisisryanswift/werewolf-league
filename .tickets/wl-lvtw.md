---
id: wl-lvtw
status: closed
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

## Notes

**2026-11-21T16:48:13Z**

Merged into integration/wl-xgp7 (impl/wl-lvtw 25c55c2). Verification on integration: pnpm test 125/125, typecheck clean. AC evidence in test/system/ratings.test.ts: exact hand-worked rating values over two scripted Matches; concurrent Matches rated from their draw-time snapshot (fails if the snapshot is ignored); the League WS pushes one {type:'leaderboard'} message per settlement; the Match commits one ratings_settled event after match_over; a lost-ack redelivery with 3 copies of one Agent on the winning side gives identical deltas, one rating update and one event. A wrangler dev run with headless Chromium showed the leaderboard updating live and sortable Overall, Wolf and Village columns. codex review P2, not fixed: League Matches persisted before this change lack ratingsBefore, and the fallback snapshots at settlement time. This only matters for Matches already live when the change deploys; nothing is deployed yet.
