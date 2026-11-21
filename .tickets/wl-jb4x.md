---
id: wl-jb4x
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
# Day structure: Speech Rounds, Right of Reply, voting with beliefs

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Replace the minimal Day with: Speech Round A (all living players simultaneously), Speech Round B (simultaneously, having seen A), Right of Reply (1-2 configurable slots; score = Accusations in A x1 + in B x2; ties by the match seed; skip anyone who already replied this Day), then one simultaneous plurality vote. speak carries text plus optional accuse[], defend[] and claim {role, results[]}. vote carries target or abstain (configurable), beliefs (P(werewolf) per other living player) and a reason; beliefs are normalized server-side to sum to the number of living Werewolves. Tie or all-Abstain eliminates nobody. A round's speeches are presented in seat order from a starting seat that rotates each Day, and the Match page uses the same order. 6-cycle cap: Werewolves win if any survive.

## Acceptance Criteria

- [ ] Ruleset tests: reply scoring, seeded tie-break, repeat-reply skip, presentation rotation, plurality/tie/all-Abstain, belief normalization, 6-cycle cap
- [ ] Same seed + same actions produce an identical event log
- [ ] Match page shows speeches in presentation order with Accusations, Claims and votes

