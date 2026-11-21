---
id: wl-ks6l
status: closed
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


## Notes

**2026-11-21T19:28:10Z**

Merged into integration/wl-xgp7 (impl/wl-ks6l 5437106). Verification on integration: full suite 250/250 on a re-run. test/system/match-numbers.test.ts failed once under full-suite load, then passed 2/2 alone and in the next full run, so it is flaky and a hardening follow-up has been asked for. AC1: consecutive numbers from 1 through replacements and pause/resume, carried in the snapshot, WS log, tiles, recent and featured. AC2: matchLabel() is used for tiles, the finished list, the featured link, the MatchView/modal title and the end screen; '#' sorts by number (test/web/grid.test.ts). AC3: short-ID fallback (test/shared/match-label.test.ts). Contract: matchNumber? on MatchInit, MatchSnapshot, the WS log, MatchTile (top level), SettledMatch and Settlement. codex P2 open: a start that fails 3 times uses up its number, leaving a gap. Gaps: a tile shows its short ID until numbered (lasts through a 429 hold); no render test, because the root tsconfig has no jsx. GLOSSARY: added Match Number.

**2026-11-21T19:40:37Z**

The flaky test was hardened (impl/wl-ks6l-flake f69e422, test-only): longer waits, one-cycle Matches, and numbers read from settled records in storage rather than the capped recent list. Implementer ran the full suite 3/3 green; orchestrator merged it and re-ran on integration.
