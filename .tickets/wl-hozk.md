---
id: wl-hozk
status: open
deps: [wl-2qjw, wl-jb4x, wl-lvtw]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Match view polish and God View

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
God View toggle (on by default) revealing roles, Wolf Chat and any God-View-only panels (including Table Suspicion once the calibration ticket adds it); off shows public info only. Accusation links between Players, Claim badges, vote panel with reasons and Abstains, copy labels, death role reveals, and an end-of-Match screen with winning Side, all roles and rating changes.

## Acceptance Criteria

- [ ] God View off hides roles, Wolf Chat and private events
- [ ] End screen shows winner, roles and rating changes
- [ ] Usable on a projector-sized screen
- [ ] The God View toggle hides and shows God-View-only panels generically; this ticket does not compute Table Suspicion
