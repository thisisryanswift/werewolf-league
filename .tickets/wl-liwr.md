---
id: wl-liwr
status: closed
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


## Notes

**2026-11-21T18:53:02Z**

Merged into integration/wl-xgp7 (impl/wl-liwr 3c157b5). Verification on integration: pnpm test 218/218, typecheck clean. AC evidence: test/vocabulary.test.ts fails on any 'god view', 'god mode' or bare 'god' in src/ and web/; the UI reads Narrator's View; the rename was mechanical (protocol godView → narratorView, test ids, data attributes and CSS classes renamed; the full map is in the implementer report). codex P2 (a ?god= alias) is not applicable, because no such param ever existed, so there is nothing to alias. Cosmetic follow-up: the runner line now reads 'Narrator (Narrator's View): …', which is redundant.
