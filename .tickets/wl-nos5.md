---
id: wl-nos5
status: closed
deps: [wl-b8rj, wl-ewd7]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Managed Agent harness

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Implement the Harness interface against the Gemini Managed Agents Interactions API with plain fetch: provision each seat's environment at Match start; first turn sends rules, Agent Instructions, role and seat list; later turns chain with previous_interaction_id + environment and embed the new observation in the previous action's function_result; tools are the seat's fixed role list (never empty), resent identically every turn; save interaction and environment IDs before anything else; poll from the Player DO alarm; ignore filesystem tool calls when picking the pending custom call; reply to out-of-phase or illegal calls with an error function_result naming the required action. Roster config holds model + Agent Instructions + harness.

**Revised after review:** Timeout recovery is required. After a timed-out continuation, cancel it; the seat's next turn answers the still-pending parent function call, and the result carries every observation the seat missed. After a timed-out first turn, which has no parent, cancel it and start a fresh chain on the same environment with a full catch-up observation (rules, role, seats, all events seen so far). Late responses from a cancelled interaction are ignored. The recovery paths are tested at the adapter level against a stubbed Interactions API (fetch stub), not the real API, and use the approach the M1 check confirmed.

## Acceptance Criteria

- [ ] A local Match (wrangler dev) runs with real Agents to a result
- [ ] Interaction IDs are persisted before polling begins
- [ ] An out-of-phase call gets an error function_result and the Agent can recover before its deadline
- [ ] Fake Harness tests still pass; the real harness is never called in tests
- [ ] Stubbed-API tests: after a continuation timeout and after a first-turn timeout, the same seat successfully acts on its next eligible turn, and its observation includes the missed events
- [ ] A late result from a cancelled interaction never reaches the Match

## Notes

**2026-11-21T16:27:50Z**

Merged into integration/wl-xgp7 (impl/wl-nos5 88c50c3; trivial union conflicts in vitest.config.ts and worker-env.d.ts resolved by the orchestrator). Verification on integration: pnpm test 93/93, typecheck clean. AC evidence: a real local Match under wrangler dev ran to a result (7 seats, 2 Hydrogen Agents: first action at 15.8 s, result at 42.0 s, Werewolf parity on Night 2; this was before the Night/Day tools merged, so the Seer/Doctor/Wolf Chat/speak schemas have not been run against the real API yet); interaction IDs are persisted before polling (test/harness/managed-agent.test.ts); an out-of-phase call gets an error function_result and the Agent recovers (harness and system tests); fake-harness tests pass and the real API is never called (stubbed fetch); continuation-timeout and first-turn-timeout recovery are proven end to end in test/system/managed-agent-recovery.test.ts; a late result from a cancelled interaction never reaches the Match, and the next turn tells the Agent 'not used'. codex review P1 (unseen observation lost) was verified as resolved by wl-cpl1's catch-up with a new system test. P2 fixes: setup IDs are saved before any cancel; the PlayerDO persists the chain returned by cancel (the watchdog was removed because cpl1 deadlines bound every turn).
