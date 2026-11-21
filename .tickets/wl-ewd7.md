---
id: wl-ewd7
status: in_progress
deps: []
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# M1 sanity check: real Managed Agent chains

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
A standalone script (not part of the Worker) that runs one short game-sized chain on Hydrogen and one on 3.8 Flash using the decided request shape: fixed non-empty tool list resent every continuation, new observation embedded in the previous action's function_result, background mode with polling, max_total_tokens about 100k. Record per-turn latency and token use. Reuse the request shapes proven in ~/dev/personal/managed-agents-testing (read FINDINGS.md sections 1, 5, 7b); do not re-research the API.

**Revised after review:** Also check the two timeout-recovery paths the harness relies on. (1) Cancel a continuation, then answer the original pending function call later with new observations, as section 1 of the probe found. (2) Cancel a first-turn interaction, which has no parent, then start a fresh chain on the same environment.

## Acceptance Criteria

- [ ] Both chains complete several turns with valid function calls
- [ ] Latency per turn (first turn and continuations) is recorded in a note on this ticket
- [ ] A keep/drop decision for 3.8 Flash on the roster is recorded (drop if much slower than Hydrogen)
- [ ] No API key is committed
- [ ] Both recovery paths are confirmed or refuted on a real chain and recorded in a note on this ticket
