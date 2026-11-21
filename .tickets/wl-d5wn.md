---
id: wl-d5wn
status: closed
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


## Notes

**2026-11-21T18:43:52Z**

Merged into integration/wl-xgp7 (impl/wl-d5wn 9686770). Verification on integration: pnpm test 200/200, typecheck clean (the implementer also passed the full suite twice). AC evidence in test/system/league-scale.test.ts: default N 24, up to 36 accepted, 37 gets 400, set-N live; ramp from empty starts exactly [4,4,4,4,4,4] per 30 s window; a 429 pauses starts for the backoff, including the provisioning path; a burst of 100 updateTile calls gives bounded tiles diffs with no full tiles; tile summary fields. codex P1s fixed: pause or lowering N during a backoff releases held Matches; sustained 429s renew the backoff (reported at most every 2 s); held Matches use up the start window. Matches report to their own League (MatchInit.league), which fixed test cross-talk. OPEN after the review cap: P1 league-feed.ts:69, after League DO hibernation the diff baseline is lost, so the next diff resends tiles but no removals and settled tiles linger on connected clients (fix: send a full league snapshot when there is no baseline); P2 a released reservation's timestamp still uses start budget; P2 held Matches launch together if startsPerWindow was lowered meanwhile.
