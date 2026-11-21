---
id: wl-ofdn
status: closed
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
  Its instructions come from docs/agent-instructions/analyst.md: everything below the `<!-- section: analyst -->` marker is mounted as /.agents/AGENTS.md at provisioning (wl-cizy mechanism). The tool list is function-only, just submit_report. Field limits (at most 5 mistakes, at most 2 per Player, 2-4 turning points) come from that file. Enforce them in the submit_report schema (maxItems) too.
- **Runtime:** reuse the Player DO plus Harness machinery for the polling, deadline and timeout handling. An Analyst is a seat-less run with a long deadline (e.g. 5 min). Persist the interaction ID first. Cap concurrent Analyst runs per League (configurable, default 4); extras queue. Usage and cost are recorded via wl-64dn.
- **Storage:** the report is stored as an analysis Match event after match_over. It's shown on the end screen and in finished Matches (Narrator's View only, since it discusses roles).
- **Isolation:** the Analyst never affects play, ratings, Calibration or the Narrator. A failed or timed-out analysis is recorded and skipped.
- **Measured costs:** Neon as a Managed Agent ~70-90 s first turn, ~$0.10 per turn (FINDINGS R2-1).

## Acceptance Criteria

- [ ] Fake-Harness test: match_over triggers one analysis run; its report becomes one analysis event; a failed run is recorded and never blocks the League
- [ ] At most the configured number of Analyst runs are in flight per League
- [ ] Real Match: a Neon report appears on the end screen with at least one concrete mistake backed by evidence
- [ ] The report is hidden when Narrator's View is off


## Notes

**2026-11-21T18:36:55Z**

Analyst Instructions drafted (8cd9071, docs/agent-instructions/analyst.md). Key decisions: judge on the Player's own information, not hindsight; blind bad luck isn't a mistake; every mistake cites evidence; at most 5 mistakes, at most 2 per Player, empty allowed; Werewolf deception is never a mistake and can be best play; no Calibration grading and no generalising about models; notes aren't in the input. Keep the 'What the Players were told' summary in sync if werewolf.md changes.

**2026-11-21T20:12:31Z**

Merged into integration/wl-xgp7 (impl/wl-ofdn db8c63a). Typecheck clean. Full suite 264/265, then 258/265, with failures only in timing-sensitive system tests (deadlines 'never answers', league-scale real-clock/sustained-429, usage) while ~38 vitest/workerd processes from parallel implementers were running. Those files pass 25/25 alone, so this is load flakiness, not a regression; rerun the full suite at a quiet moment before the final deploy. AC1-4 evidence per the implementer: test/system/analyst.test.ts (one analysis event per Match, failure reasons, the League never blocked, slot cap overlap), test/web/match-view.test.ts (hidden with Narrator's View off). Real smoke Match 211342fc: Neon analysis took 85.7 s and cost $0.1646 (Match total $0.2814); report at /tmp/wl-ofdn-verify/end.png. The Analyst is OFF by default; enable it with config {analyst:{harness:'managed-agent', model:'gemini-4-neon'}, analystConcurrency:4}. NOTE: Neon runs on the same Managed Agents TPM quota as the Players. Open: no test for the backstop/abandon path; the League snapshot doesn't show the analyst config.
