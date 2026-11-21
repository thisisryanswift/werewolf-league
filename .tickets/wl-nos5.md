---
id: wl-nos5
status: open
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

## Acceptance Criteria

- [ ] A local Match (wrangler dev) runs with real Agents to a result
- [ ] Interaction IDs are persisted before polling begins
- [ ] An out-of-phase call gets an error function_result and the Agent can recover before its deadline
- [ ] Fake Harness tests still pass; the real harness is never called in tests

