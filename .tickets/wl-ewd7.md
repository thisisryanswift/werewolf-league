---
id: wl-ewd7
status: closed
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

## Notes

**2026-11-21T15:40:12Z**

M1 results (scripts/m1/, results in scripts/m1/results/README.md). Both chains completed all 6 turns (8-seat Seer chain: inspect/speak/vote x2) with valid function calls on Hydrogen and 3.8 Flash, 2 runs each; all 24 turns ended requires_action with the expected tool.
Latency (start of create() to terminal status, 0.5 s polling): first turn 5.8-10.4 s on both models. Continuations (n=10 per model): Hydrogen median 7.1 s, mean 8.3 s, range 5.5-14.5 s; 3.8 Flash median 8.9 s, mean 9.3 s, range 5.4-14.3 s. By turn 5 input was ~12k tokens (~1.2-1.5k added per turn), so max_total_tokens 100k leaves plenty of headroom. No ~40 s tail turns in this small sample.
Decision: KEEP 3.8 Flash on the roster. Its median is ~1.25x Hydrogen's with the same tail, well inside the 60 s deadline.
Recovery (on Hydrogen): (1) CONFIRMED. A cancelled in_progress continuation goes to cancelled and the parent stays requires_action. A later continuation from the same parent with the same call_id and newer observations returned a valid speak, and the next turn a valid vote. The cancelled observation did not leak into context. (2) CONFIRMED. A cancelled first turn shows cancelled with 0 steps, and environment_id is unchanged and is returned on the first create() response. A fresh chain on that environment_id (no previous_interaction_id) returned a valid call, and its continuation also worked.
For wl-nos5: environment_id arrives on the first create() response; the cancel response already reports cancelled; create() takes ~1 s on an existing environment and 2-5 s on a fresh one, so provision environments up front.
Verification: node --test scripts/m1/ (2 pass). Results were scanned for the API key and auth headers; none were found.

**2026-11-21T15:40:12Z**

codex review (P2 only, not fixed): (a) The first-turn recovery probe restarted with the original Night 1 prompt rather than a later catch-up observation, so the catch-up content itself is left to wl-nos5's stubbed-API tests. (b) Committed results JSON contains real interaction and environment IDs. These are not secrets (the repo has no remote), but they could be redacted later.
