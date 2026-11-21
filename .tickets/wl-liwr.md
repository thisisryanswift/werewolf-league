---
id: wl-liwr
status: in_progress
deps: [wl-gtil, wl-hozk]
links: []
created: 2026-11-21T18:04:53Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Rename God View to Narrator's View in the app

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md.

## What to build
The spectator toggle and every user-facing label say Narrator's View (GLOSSARY.md), never God View or god mode. Rename code identifiers too (e.g. godView -> narratorView, God-View-only -> Narrator's-View-only), including protocol fields and URL params. Keep accepting an old ?god= param as an alias so existing links keep working. Do it after the in-flight UI tickets (wl-gtil, wl-hozk) merge, to avoid conflicts. Mechanical rename; there are ~49 code references at time of writing.

## Acceptance Criteria

- [ ] No user-visible text says God View or god mode
- [ ] grep finds no godView/God View identifiers in src/ or web/ (except the legacy ?god= alias)
- [ ] All tests pass; the toggle behaves exactly as before

