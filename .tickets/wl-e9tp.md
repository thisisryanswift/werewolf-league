---
id: wl-e9tp
status: in_progress
deps: []
links: []
created: 2026-11-21T16:46:39Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Display names for Players

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Players must not see model names.
- **Assigning names:** at Match setup, each seat gets a Display Name drawn deterministically from the match seed from a fixed list of plain first names. Names are unique within a Match and never look like a model name.
- **What Players see:** everything an Agent sees uses Display Names only: briefing, seat list, partner line, observations, Wolf Chat, votes revealed, deaths and error results. Tool fields still take seat numbers.
- **What spectators see:** the Display Name together with the Agent and copy label, e.g. 'Mara · Hydrogen #2', on tiles and in the Match view, with no toggle.
- **Protocol:** carries both fields, so wl-gtil and wl-hozk can render them.

## Acceptance Criteria

- [ ] Whole-system test: no text sent to any Player contains a roster Agent name, a model id or a copy label
- [ ] The same seed gives the same Display Names; names are unique within a Match
- [ ] The spectator Match view and tiles show 'Display Name · Agent #n'


## Notes

**2026-11-21T17:10:28Z**

Merged into integration/wl-xgp7 (impl/wl-e9tp c70fb6c). Verification on integration: pnpm test 156/156, typecheck clean. AC1: test/system/display-names.test.ts scans every request input, tool and mounted AGENTS.md sent to the stubbed API (also in all three recovery tests) for Agent names, ids, model ids and copy labels, with a failure check. AC2: test/core/display-names.test.ts (deterministic, unique at 16 seats over 200 seeds; the codex P1 fix excludes participating Agent names and ids from the pool). AC3: tiles and the old Match page showed 'Otto · 3.8 Flash #1' in wrangler dev. Kept OPEN: wl-hozk's new MatchView (web/match/model.ts playerLabel/agentName) must be routed through spectatorLabel after it merges.
