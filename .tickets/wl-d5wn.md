---
id: wl-d5wn
status: in_progress
deps: []
links: []
created: 2026-11-21T16:37:39Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# League at scale: staggered starts, 429 backoff, coalesced feed

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
This is a follow-up to wl-kh5w (closed with default N 6 and a basic grid) for the 2026-11-21 scale revision:
- **Default N:** 24, still settable live.
- **Staggered starts:** at most 4 new Matches every 30 s (configurable).
- **429 backoff:** when any Player reports a 429, the League stops starting new Matches for a backoff period (configurable, default 60 s) and records the event.
- **Coalesced feed:** Match DOs push tile summaries; the League coalesces them into small per-tile diffs broadcast to grid clients at most every ~500 ms (configurable), never one push per event.
- **Tile summaries** carry what the dense grid (wl-gtil) needs: seat pips, phase, Day/Night number, step tag, alive count, thinking count, timeouts and the latest speech line, plus optional Drama Score/Drama Flag fields (left empty until the Narrator lands).
- **Demo-critical:** pause/resume and set-N. Keep the basic grid working; the dense grid is wl-gtil.

## Acceptance Criteria

- [ ] Default N is 24 and set-N still takes effect live
- [ ] Whole-system test: starting N=24 from empty launches at most 4 Matches per 30 s window (fake clock/alarms) until N is reached
- [ ] Whole-system test: a 429 reported by a Player pauses new starts for the backoff period
- [ ] Whole-system test: a burst of Match events produces a bounded number of League feed pushes carrying per-tile diffs
- [ ] Tile summaries include the fields listed above

