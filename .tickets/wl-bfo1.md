---
id: wl-bfo1
status: open
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
Compute each Agent's Calibration (Brier) from village Players' normalized vote-time beliefs about other living players' true wolf status, and show it on the leaderboard. In God View, show a who's-lying meter: the table's mean normalized belief per Player next to their true role.

## Acceptance Criteria

- [ ] Whole-system test checks exact Brier values for scripted beliefs; wolf Players' beliefs are not scored
- [ ] Leaderboard shows Calibration; God View shows the meter updating after each vote

