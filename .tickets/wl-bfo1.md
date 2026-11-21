---
id: wl-bfo1
status: closed
deps: [wl-jb4x, wl-lvtw]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Calibration score and suspicion meter

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Compute each Agent's Calibration (Brier) from village Players' normalized vote-time beliefs about other living players' true wolf status, and show it on the leaderboard. In God View, show the Table Suspicion meter: for each Player, the mean normalized belief over every ballot that rates them (wolf ballots included), next to their true role.

**Revised after review:** This ticket owns the Table Suspicion meter from start to finish (computation and rendering); the God View ticket only controls whether it's visible. Brier uses village ballots only; timed-out votes contribute no ballot to either the meter or Brier.

## Acceptance Criteria

- [ ] Whole-system test checks exact Brier values for scripted beliefs; wolf Players' beliefs are not scored
- [ ] Leaderboard shows Calibration; God View shows the meter updating after each vote
- [ ] Exact fixtures: Brier and Table Suspicion values for a Match that includes a wolf ballot, a concentrated village ballot and a timed-out vote

## Notes

**2026-11-21T17:04:12Z**

Merged into integration/wl-xgp7 (impl/wl-bfo1 2ed64ba). codex review: no findings. Verification on integration: pnpm test 138/138, typecheck clean. AC evidence: test/system/calibration.test.ts gives exact Brier values through real DOs (2/15 for Match 1, pooled 56/225 over two Matches); wolf ballots are not scored (a mutation check fails), and a wolf-only Agent has calibration null. test/werewolf/calibration.test.ts has exact Table Suspicion and Brier fixtures covering a wolf ballot, a concentrated village ballot, timed-out votes and a uniform ballot. In a wrangler dev headless run the leaderboard showed the Calibration column and the God View meter updated after each vote (/tmp/bfo1/*.png). Contracts: MatchResult.beliefSide; AgentStanding.calibration (number|null, lower is better); src/shared/beliefs.ts; TableSuspicion component (God-View-only, needs the full God View log). Semantics chosen: mean per belief pooled over all of an Agent's village seats and Matches; the meter is cumulative over the Match.
