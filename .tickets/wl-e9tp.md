---
id: wl-e9tp
status: open
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

