---
id: wl-af5m
status: closed
deps: [wl-kh5w, wl-gtil]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Finished Matches: featured link (core) and replay controls (stretch)

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Core: finished Matches stay openable on the Match page (the full log is sent on join), and the grid shows a pinned link to a featured finished real Match (it opens the Match modal via its #match=<id> link from wl-gtil), so a judge arriving during Night 1 can see a complete Match right away. Stretch, only after the rehearsal gate passes: a finished-Match list and playback controls (step, play, scrub).

## Acceptance Criteria

- [ ] A finished Match opens and plays back its full event log
- [ ] Finished Matches are listed from the grid page
- [ ] The grid shows a pinned featured finished Match link that opens the complete Match

## Notes

**2026-11-21T16:34:34Z**

Merged into integration/wl-xgp7 (impl/wl-af5m 5cc90e9). codex review: no findings. Verification on integration: pnpm test 120/120, typecheck clean. AC evidence: test/system/finished-matches.test.ts (a finished Match's WS sends one log message with seq 1..n ending in match_over; the featured Match defaults to the most recent finished Match; an operator pin persists, null clears it, unfinished or unknown Matches get 400, missing or wrong secret gets 401). In headless Chromium on wrangler dev the finished-Match list showed 12 links, and the featured link opened a complete 116-event Match. New contract: LeagueSnapshot.featured and POST /api/admin/league/featured {matchId|null}. Stretch playback controls (step/play/scrub) NOT built; they are deferred until the rehearsal gate passes, and none of this ticket's acceptance criteria require them.
