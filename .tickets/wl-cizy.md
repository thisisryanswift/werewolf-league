---
id: wl-cizy
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
# Mount Agent Instructions as each seat's AGENTS.md

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Deliver the Agent Instructions in docs/agent-instructions/werewolf.md the native Managed Agents way: as /.agents/AGENTS.md in each Player's sandbox.
- **Sections:** an Agent's instructions are keyed text sections, parsed from the file's <!-- section: NAME --> markers. Everything above the first marker is for humans and is never mounted.
- **Ruleset names the keys:** the Ruleset interface gains a way to name a seat's section keys, in order. Werewolf: Villager = shared, village; Seer = shared, village, seer; Doctor = shared, village, doctor; Werewolf = shared, werewolf.
- **Match assembles:** the Match DO assembles the text and passes it to the Harness at provisioning. The Harness and League never learn roles.
- **Managed Agent harness:** writes the assembled text to /.agents/AGENTS.md in the seat's environment before the first turn. Use a documented environment file or inline-source mechanism; check the gemini-managed-agents skill and the agent-environment docs. A fresh chain on the same environment, after a first-turn timeout, keeps the mounted file.
- **Verify first:** start with a short real probe. With a function-only tool list, does the agent follow an instruction that appears only in the mounted AGENTS.md (for example a canary argument value)? Record the result as a note on this ticket.
  - If pickup works: stop putting the instructions into the first-turn input, to avoid duplication.
  - If it doesn't: keep the existing first-turn path, which already re-sends the text after a restart, and record that.
- **Keep the notes scratchpad.** The text tells agents to keep /notes.md, as a deliberate Managed Agents feature.

## Acceptance Criteria

- [ ] Real probe result recorded: does a function-only agent follow mounted AGENTS.md? Delivery path chosen accordingly
- [ ] Whole-system test (Fake Harness records what it was given): each seat receives exactly its Ruleset-named sections in order, and no seat ever receives another role's section (a Werewolf gets shared and werewolf only)
- [ ] The Harness and League code contain no role names
- [ ] A real local Match shows Agents behaving per the instructions (short speeches, accuse/defend fields filled in)

