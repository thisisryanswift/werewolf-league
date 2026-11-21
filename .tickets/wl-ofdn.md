---
id: wl-ofdn
status: open
deps: [wl-hozk, wl-64dn]
links: []
created: 2026-11-21T18:22:17Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Neon Analyst: post-Match review by a Managed Agent

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002, docs/adr/0003.

## What to build
After each Match ends, an Analyst (gemini-4-neon on the Managed Agent harness) reviews it. This gives the project its second Gemini 4 model with a clear job: Hydrogen plays, Neon analyzes, gemini-decision-1 narrates.
- **Input:** the full Narrator's View log rendered as text (the same renderer the Narrator uses), the final roles, the result and per-Player stats.
- **Output:** a fixed function tool, submit_report, with:
  - summary (2-3 sentences);
  - turning_points [{when, what}];
  - mistakes [{seat, agent, what, evidence}], e.g. a Doctor protecting a Werewolf, or the village eliminating its own Seer;
  - best_play {seat, why};
  - why_winner_won.
  Its own AGENTS.md instructions are mounted at provisioning (wl-cizy mechanism).
- **Runtime:** reuse the Player DO plus Harness machinery for the polling, deadline and timeout handling. An Analyst is a seat-less run with a long deadline (e.g. 5 min). Persist the interaction ID first. Cap concurrent Analyst runs per League (configurable, default 4); extras queue. Usage and cost are recorded via wl-64dn.
- **Storage:** the report is stored as an analysis Match event after match_over. It's shown on the end screen and in finished Matches (Narrator's View only, since it discusses roles).
- **Isolation:** the Analyst never affects play, ratings, Calibration or the Narrator. A failed or timed-out analysis is recorded and skipped.
- **Measured costs:** Neon as a Managed Agent ~70-90 s first turn, ~$0.10 per turn (FINDINGS R2-1).

## Acceptance Criteria

- [ ] Fake-Harness test: match_over triggers one analysis run; its report becomes one analysis event; a failed run is recorded and never blocks the League
- [ ] At most the configured number of Analyst runs are in flight per League
- [ ] Real Match: a Neon report appears on the end screen with at least one concrete mistake backed by evidence
- [ ] The report is hidden when Narrator's View is off

