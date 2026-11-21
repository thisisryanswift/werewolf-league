---
id: wl-cpl1
status: open
deps: [wl-b8rj]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Deadlines and default actions

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Every turn has a deadline: 60 s, first turn 90 s, both configurable. The Player DO cancels a turn that misses its deadline and reports a timeout; the Match applies the default (skipped speech, Abstain vote, no night action; both wolves timing out means no kill). Simultaneous steps wait for all Players or their deadlines. Timeouts are recorded per Player and per Agent and shown in Match stats. Players with a turn in flight show a thinking indicator; timed-out actions are marked.

## Acceptance Criteria

- [ ] Whole-system test: a Fake Harness Agent that never answers gets defaults and the Match still finishes
- [ ] Timeout counts per Agent are exposed in Match stats
- [ ] Match page shows thinking and timeout markers

