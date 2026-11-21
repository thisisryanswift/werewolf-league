---
id: wl-2qjw
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
# Night roles: Seer, Doctor, Wolf Chat, Pack Leader

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Extend the Werewolf Ruleset Night: Wolf Chat (2 exchanges, visible to wolves and God View only), each wolf proposes a kill, the Night's Pack Leader decides on a split and the role alternates each Night; Seer inspects one player and privately learns their Side; Doctor protects one player (self allowed, not the same player on consecutive Nights). Seats get their fixed role tools (inspect, protect, wolf_chat, choose_kill). Night events appear on the Match page.

## Acceptance Criteria

- [ ] Ruleset tests: wolf split resolved by the alternating Pack Leader; Doctor save cancels the kill; consecutive-protect rejected with a message naming the rule; Seer receives the correct Side privately
- [ ] Wolf Chat and Seer results are absent from village Players' observations
- [ ] Whole-system test with fake Agents covers a 7-seat Match with all roles

