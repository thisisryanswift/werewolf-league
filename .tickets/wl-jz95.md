---
id: wl-jz95
status: in_progress
deps: []
links: []
created: 2026-11-21T20:29:20Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Expandable notes in the Match feed

## Parent
Spec wl-xgp7. Follow-up to wl-rhpr (Agent notes in Narrator's View).

## What to build
Each '📝 Seat N (Name · Agent) rewrote its notes' feed item becomes expandable (a native <details>/<summary>, collapsed by default). Expanding it shows that notes_updated event's full text: the note as written at that moment, in a monospace block with line breaks kept. It's Narrator's View only, like today.
- The data is already there: notes_updated events carry { seat, text, truncated } (verified in deployed Match db4957b4, which has 12 notes events with real content). Show '(truncated)' when truncated is true.
- Keyboard and screen-reader friendly via native <details>. Expanding never scrolls or jumps the feed.
- **Optional, only if trivial:** a 'changed since last version' highlight.

**Context:** notes ARE being written in real Matches. The earlier 'no Agent wrote notes' finding came from one test Match, so no preamble change is needed.

## Acceptance Criteria

- [ ] Every notes feed item expands to show that version's full text; collapsed by default
- [ ] Hidden entirely when Narrator's View is off
- [ ] Works in the Match modal and in finished-Match replays

