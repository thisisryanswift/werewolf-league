---
id: wl-pbkx
status: in_progress
deps: [wl-jb4x, wl-kh5w]
links: []
created: 2026-11-21T16:34:58Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [stretch, ready-for-agent]
---
# Narrator: Drama Score and Drama Flags (stretch)

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
**Stretch.** The go/no-go call is at about 13:30, depending on how wave 2 is going. The orchestrator must not start this ticket until the human retags it ready-for-agent.

Add a Narrator behind an interface:
- **Interface:** narrate(godViewLog) returns { dramaScore, flags: [{ id, value, visibility: public-safe | secret }] }. It has a gemini-decision-1 implementation and a scripted fake.
- **When it runs:** after each published step (dawn/Night resolution, each Speech Round, Right of Reply, vote), the Match DO sends the God View log to the Narrator. That log includes roles, Wolf Chat and Seer results.
- **Questions:** one score question, drama (calm to explosive), plus yes/no Drama Flags:
  - public-safe: claim war; vote on a knife edge; table split on who the wolves are; village eliminated its own power role (judged after the reveal);
  - secret: a wolf is fooling the table; wolves split in Wolf Chat.
- **Flags:** a flag is active when its answer is at or above a configurable threshold (default 0.7). Answers are never summed, so the over-summing caveat in FINDINGS section 8 doesn't apply.
- **Output:** the result is stored as a Match event. Secret flags are God-View-only, filtered like other private events. The Drama Score and active flags go into the tile summary sent to the League.
- **Throttling:** at most one Narrator call per Match is in flight, and a newer step supersedes a pending one. A failure, or a call slower than about 5 s, is dropped, and the tile keeps its last value.
- **Isolation:** the Narrator never affects play, observations, ratings, Calibration or Table Suspicion.
- **Request shape:** see FINDINGS.md section 8 and the gemini-api-dev skill (Decisions is v1beta).

## Acceptance Criteria

- [ ] Whole-system test with the fake Narrator: results become Match events and reach tile summaries
- [ ] With God View off, secret flags are hidden and public-safe flags are shown
- [ ] A failing or slow fake Narrator never delays the Match, and the tile keeps its last Drama Score
- [ ] At most one Narrator call per Match is in flight
- [ ] The Decisions implementation is exercised for real only in the rehearsal or a manual smoke test


## Notes

**2026-11-21T16:43:58Z**

Go decision (human, ~12:10 on 2026-11-21): proceed now; retagged ready-for-agent.
