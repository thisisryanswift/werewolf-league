---
id: wl-64dn
status: closed
deps: []
links: []
created: 2026-11-21T17:44:22Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Record real token usage and cost per Match and Agent

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Replace cost estimates with measured spend.
- **Usage per turn:** when a Player's interaction reaches a terminal status (requires_action, completed, cancelled or incomplete), the Managed Agent harness reads its usage (total input, cached, thought and output tokens) and returns it with the turn result. Cancelled or timed-out interactions still count, because their tokens were billed. The Narrator's Decisions calls report their input tokens the same way.
- **Pricing:** cost = uncached input × input price + cached × cached price + (output + thought) × output price. Prices live in a config table per model, with FINDINGS.md section 9 values (per 1M tokens):
  - Hydrogen: $1.50 / $0.075 / $7.50
  - 3.8 Flash and 3.6 Flash: $0.75 / $0.075 / $3.75
  - 3.5 Flash-Lite: $0.30 / $0.03 / $2.50
  - gemini-decision-1: $0.10 input, output free
  - Note: total input includes cached tokens.
- **Aggregation:** the Match keeps a running cost per Player and per Agent and records it in its tile summary and its result. The League keeps total spend, spend since resume, and per-Agent spend.
- **Display:** the tile shows the Match's cost so far; the end screen shows final cost and per-Agent cost; the leaderboard can show cost per Match per Agent; the admin snapshot shows League spend.
- **Ramp cap:** wl-t4no's ramp test uses League spend (real, not the $1-1.5 estimate) for its $50 cap. Optionally, an operator spend cap pauses the League automatically when reached.
- **Privacy:** cost and token counts are fine to show publicly. Never log request bodies or keys.

## Acceptance Criteria

- [ ] Fake Harness tests: scripted usage per turn aggregates to exact per-Player, per-Agent, per-Match and League totals, including cancelled/timed-out turns
- [ ] Price table in config, with a test of the cost formula (cached tokens split out of total input)
- [ ] A real local Match reports a final cost; compare it to the AI Studio usage dashboard if available, and note it
- [ ] Tile and end screen show cost; the League snapshot shows total spend and spend since resume


## Notes

**2026-11-21T19:19:59Z**

Merged into integration/wl-xgp7 (impl/wl-64dn ee5d364). Verification on integration: pnpm test 244/244, typecheck clean. AC1: test/system/usage.test.ts has exact per-Player/Agent/Match/League totals, including timed-out, invalid-retry, setup and Narrator usage, plus the spend cap; harness stub tests cover usage reads on poll, cancel, reconcile, setup and close. AC2: src/core/pricing.ts PRICES with test/core/pricing.test.ts (cached tokens split out). AC3: real local Match 35fc4bd6 (Hydrogen + 3.5 Flash-Lite, village win, 188 s) measured /bin/bash.3214 (Hydrogen /bin/bash.2616, Flash-Lite /bin/bash.0599); 515,660 input tokens (364,256 cached), 25,848 thought, 4,087 output. Not compared with the AI Studio dashboard, which the agent couldn't see; the human can check it. Ran before the setup-billing fix. AC4: tile summary 'cost' (shown in the grid footer), end-screen Cost table (/tmp/wl64/end.png), home 'League spend' line, $/Match leaderboard column, GET /api/league spend {total, sinceResume, byAgent, resumedAt}. New: config spendCap auto-pauses, and resume over the cap is refused. Open P2s: close() re-reads only cancelled final interactions; player close gives up after 5 rounds; aborted narration usage is never read.
