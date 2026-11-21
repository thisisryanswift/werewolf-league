---
id: wl-ks6l
status: in_progress
deps: []
links: []
created: 2026-11-21T19:07:49Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Sequential Match Numbers (Match 1, 2, 3...)

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md.

## What to build
Spectators see 'Match 127' instead of a truncated UUID ('Match 492BEB1A').
- **Assigning numbers:** the League assigns each new Match a sequential Match Number (1, 2, 3, ...) when it starts it, kept in the League DO's SQLite (single-threaded, so it never skips or duplicates). The number is stored in the Match's metadata and tile summary, and is per League once wl-2lfo lands.
- **Where it shows:** the tile label, Match modal title, finished-Matches list, end screen, and Analyst/Narrator headers. The grid's '#' sort uses the number; today it sorts by random UUID, which is meaningless.
- **The Match ID (UUID) stays** as the DO name and in #match=<id> links. Nothing about addressing changes.
- **Older Matches** created before this change show their short ID as before.
- **Today** the short ID comes from matchId.slice(0, 8) in web/grid/LeagueGrid.tsx, web/components/FinishedMatches.tsx and web/match/MatchView.tsx.

## Acceptance Criteria

- [ ] Whole-system test: Matches started by one League get consecutive Match Numbers starting at 1, including replacements and after a pause/resume
- [ ] Tiles, the modal title, the finished list and the end screen show 'Match N'; '#' sort orders by N
- [ ] Matches without a number fall back to the short ID

