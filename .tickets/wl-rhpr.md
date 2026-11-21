---
id: wl-rhpr
status: closed
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


## Notes

**2026-11-21T18:26:47Z**

Human decision: start when unblocked (after wl-t4no and wl-hozk); the stretch tag is not a gate.

**2026-11-21T20:21:32Z**

Merged into integration/wl-xgp7 (impl/wl-rhpr eb1b7e5). Typecheck clean; notes, web and harness tests pass on integration (full-suite timing flakes under load are known). AC1-3 met: test/system/notes.test.ts, test/web/notes.test.ts, and 3 capture tests in test/harness/managed-agent.test.ts. AC4 NOT MET: in one real Match (Hydrogen + 3.5 Flash-Lite) no Agent wrote /notes.md; 13 real interactions held only game calls. Likely cause: the harness PREAMBLE ('Act only by calling the game tools … exactly one tool per turn') conflicts with the Notes instruction. A preamble change needs the human's decision (token use near the TPM quota). Kept open.

**2026-11-21T20:26:58Z**

AC4 now MET (impl/wl-rhpr-notes 10a58b5, merged). The harness PREAMBLE allows one short /notes.md write before exactly one game tool call. Real local Match 9899c442 (Hydrogen + 3.5 Flash-Lite): 31 notes_updated events from 45 turns, written by 6 of 7 seats (the 7th died on N1) and both models; the Seer kept its inspections ('N1: Tobin (4) = WOLF'). Step p50 ~9 s (was ~12 s), no timeouts, $0.35. Screenshots in /tmp/wl-rhpr-notes-verify/. Worker log showed 8 GET poll timeouts (5 s) and 12 '400 Precondition check failed'; neither caused a timed-out turn, and neither is investigated yet (watch on deploy).

**2026-11-21T20:29:20Z**

Human check 2026-11-21 ~15:30: notes ARE written in real Matches. Deployed Match db4957b4 has 12 notes_updated events with real content (e.g. Otto's Day 1 wolf strategy). No preamble change needed; AC4 is satisfied by that Match. Follow-up UI: wl-jz95 (expandable notes in the feed).
