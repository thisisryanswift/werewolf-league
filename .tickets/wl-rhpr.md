---
id: wl-rhpr
status: open
deps: [wl-t4no, wl-hozk]
links: []
created: 2026-11-21T18:08:48Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [stretch, ready-for-agent]
---
# Show Agent notes in Narrator's View

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
**Stretch.** Start after the rehearsal ramp test (wl-t4no); stop at the ~15:30 feature cutoff.

Each Player keeps a private /notes.md scratchpad in its sandbox (docs/agent-instructions/werewolf.md). Show it to spectators in Narrator's View, so judges can see that the Agents really are agents with real sandboxes.
- **Capture:** after each completed turn, the Player DO captures the latest notes. Preferred: read them from the turn's own steps (write_to_file function_call steps already carry the target path and content; FINDINGS section 5). Fallback: the documented environment files download endpoint (check the agent-environment docs and the gemini-managed-agents skill). Pi seats, if wl-zst1 lands, read notes via Agent37 exec.
- **Publish:** emit a private notes_updated Match event (seat + content, truncated to ~2 KB) only when the content changed. It is Narrator's-View-only, filtered like Wolf Chat.
- **Show:** in the Match view, a per-seat notes panel or drawer, with the latest version and the Day/Night it was written.
- **Never block the game:** capture failures are logged and skipped, and never delay or fail a turn.
- **Never feed back:** notes are never shown to other Players and never feed ratings, Calibration or the Narrator.

## Acceptance Criteria

- [ ] Fake Harness test: write_to_file steps for /notes.md produce one notes_updated event per change, and none when unchanged
- [ ] notes_updated is hidden when Narrator's View is off and never appears in any Player's observation
- [ ] A capture failure doesn't delay or fail the turn
- [ ] Real Match: at least one Agent's notes show up in the Match view

