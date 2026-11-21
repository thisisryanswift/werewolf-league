---
id: wl-jb4x
status: closed
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
Replace the minimal Day with: Speech Round A (all living players simultaneously), Speech Round B (simultaneously, having seen A), Right of Reply (1-2 configurable slots; score = Accusations in A x1 + in B x2; ties by the match seed; skip anyone who already replied this Day), then one simultaneous plurality vote. speak carries text plus optional accuse[], defend[] and claim {role, results[]}. vote carries target or abstain (configurable), beliefs (P(werewolf) per other living player) and a reason; beliefs are normalized server-side to sum to the number of living Werewolves. Tie or all-Abstain eliminates nobody. A round's speeches are presented in seat order from a starting seat that rotates each Day, and the Match page uses the same order.

**Revised after review:** (The 6-cycle cap moved to the walking skeleton.)
Ordering: each seat's observation is frozen when the round starts. A seat retrying an illegal call never sees speeches from the same round. The resolved round is published only after every seat has resolved (acted or timed out), in presentation order.
Belief rules: each ballot is normalized to the number of Werewolves among the voter's other living seats (village voter: W living wolves; wolf voter: W-1). Values are capped at 1 and the excess spread over the uncapped seats. An all-zero or missing ballot becomes uniform. A timed-out vote has no ballot.
Right of Reply is skipped when nobody has an accusation point; only Players with at least 1 point can be Repliers.
A timed-out vote is always an Abstain, even when voluntary Abstain is disabled; that setting only removes the abstain option from the vote tool.

## Acceptance Criteria

- [ ] Ruleset tests: reply scoring, seeded tie-break, repeat-reply skip, presentation rotation, plurality/tie/all-Abstain, belief normalization
- [ ] Same seed + same actions produce an identical event log
- [ ] Match page shows speeches in presentation order with Accusations, Claims and votes
- [ ] Same Speech Round resolved with opposite arrival orders gives an identical event log; a seat retrying an illegal call sees the same frozen observation
- [ ] Belief fixtures with exact expected values: a wolf voter (target W-1), a concentrated village ballot [1,0,0,...] with target 2, an all-zero ballot, and a timed-out vote (no ballot)
- [ ] Ruleset tests: no accusations means no Right of Reply; a timed-out vote with voluntary Abstain disabled counts as an Abstain

## Notes

**2026-11-21T16:28:23Z**

Merged into integration/wl-xgp7 (impl/wl-jb4x plus the codex P2 CSS brace fix; merged cleanly after wl-kh5w and wl-nos5). Verification on integration: pnpm test 116/116, typecheck clean. AC evidence: test/werewolf/day.test.ts (reply scoring A x1 / B x2, seeded tie-break, repeat-reply skip, presentation rotation, plurality/tie/all-Abstain, exact belief-normalization fixtures for a wolf voter (W-1), a concentrated [1,0,...] ballot, an all-zero ballot and a timed-out vote with no ballot, no-Accusations meaning no Right of Reply, a timed-out vote with Abstain disabled counting as Abstain, and the same seed giving an identical log); test/system/day.test.ts (opposite arrival orders give identical decisions; a retry after an illegal call sees the same frozen observation, checked with a mutation test). A wrangler dev headless run showed speeches in presentation order with Accusation/Claim badges and vote reasons. Contracts: speech events {cycle, round A|B|reply, seat, skipped, text|null, accuse, defend, claim}; beliefs_recorded (God View only, audience []) for wl-bfo1; MatchResult.ballots; config speechRounds and replySlots.
