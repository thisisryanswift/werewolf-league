---
id: wl-af5m
status: open
deps: [wl-kh5w]
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
Core: finished Matches stay openable on the Match page (the full log is sent on join), and the grid shows a pinned link to a featured finished real Match, so a judge arriving during Night 1 can see a complete Match right away. Stretch, only after the rehearsal gate passes: a finished-Match list and playback controls (step, play, scrub).

## Acceptance Criteria

- [ ] A finished Match opens and plays back its full event log
- [ ] Finished Matches are listed from the grid page
- [ ] The grid shows a pinned featured finished Match link that opens the complete Match
