---
id: wl-oka5
status: open
deps: [wl-ofdn]
links: []
created: 2026-11-21T18:22:17Z
type: task
priority: 3
assignee: Ryan Swift
parent: wl-xgp7
tags: [stretch, future, ready-for-human]
---
# Carbon Analyst on sampled Matches, compared with Neon

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002, docs/adr/0003.

## What to build
**Follow-up to the Neon Analyst. Not started until the human retags it.**

Run gemini-4-carbon as a second Analyst on a sample of Matches (the featured Match, or every Nth; configurable), because it's slow: ~11 min first turn and ~$0.29 per turn as a Managed Agent (FINDINGS R2-1). Use the same submit_report tool. Show the Neon and Carbon reports side by side, plus an agreement score from a Decisions API question (do the two reports agree on why the winner won and on the biggest mistake?).

## Acceptance Criteria

- [ ] Carbon reports on sampled Matches only, as a Managed Agent
- [ ] Side-by-side view with a Decisions-based agreement score

