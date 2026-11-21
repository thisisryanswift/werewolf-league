---
id: wl-b8rj
status: closed
deps: []
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Walking skeleton: one fake Match end to end

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Scaffold the TypeScript Worker (Wrangler, SQLite-backed Durable Objects), the React + Vite frontend served as static assets, and a @cloudflare/vitest-pool-workers test setup. Define the Ruleset interface and the Harness interface. Build the Match DO and Player DO, and a scripted Fake Harness. Implement a minimal Werewolf Ruleset: Werewolves and Villagers only, a Night kill, one simultaneous Day vote, and win conditions. An admin-only endpoint (shared-secret header) starts a Match with fake Agents. A bare Match page connects to the Match WebSocket, receives the full event log on join, then live events.

**Revised after review:** The skeleton includes a termination rule from the start: after the 6th Day/Night cycle, Werewolves win if any survive. This lets all-default play be tested here and in the deadlines ticket. Ordering contract: every committed event gets a monotonically increasing sequence number. Each Player's observation is frozen when the step starts. On joining, a spectator is subscribed and sent the log in a single step, so it neither misses nor duplicates an event, and clients dedupe by sequence number. An "identical event log" means the same game decisions in the same order; operational fields (timestamps, thinking indicators) are excluded.

## Acceptance Criteria

- [ ] A whole-system test starts a Match with Fake Harness Agents and it runs to a correct winner through real Match/Player DOs and alarms
- [ ] Joining the Match WebSocket mid-Match delivers the full event log, then live events
- [ ] Ruleset pure tests cover the minimal kill/vote/win rules
- [ ] Match, League, Player code depends only on the Ruleset interface (no werewolf logic outside the Ruleset)
- [ ] Opening the Match page locally (wrangler dev) shows the events of a fake Match live
- [ ] A Match where every Agent returns only defaults still terminates via the 6-cycle cap
- [ ] Committed events carry strictly increasing sequence numbers; a spectator reconnecting while a step is in progress ends up with every event exactly once

## Notes

**2026-11-21T15:59:33Z**

Merged into integration/wl-xgp7 (f5a6c4f; impl/wl-b8rj 3e1887c). Verification on integration: pnpm test 39/39 passing; pnpm typecheck clean. AC evidence: test/system/match.test.ts (Village and Werewolf winners through real DOs and alarms); test/system/spectator.test.ts (mid-Match join gives the full log then live events; reconnect during a step gives seq 1..n exactly once); test/werewolf/*.test.ts (pure kill/vote/win rules and the 6-cycle cap); test/architecture.test.ts (no werewolf imports outside the Ruleset); wrangler dev smoke via scripts/watch-fake-match.mjs showed log=15 live=14 contiguous_exactly_once=true and the Match page rendered live; an all-defaults Match ends with reason cycle_cap. The codex review P1 (same-Agent wolf pair) and P2 (stuck Match after a failed provision) were fixed with tests before the merge.

**2026-11-21T15:59:33Z**

Known limits handed to follow-ons. wl-cpl1: the Player DO alarm can overwrite a turn that arrives while it awaits the Harness; a partial dispatch in the Match alarm is not re-sent. wl-kh5w: League result reporting is not retried. Nits: the Fake Harness mentions vote, abstain and beliefs; helper names aliveWolves and wolfSeats go against the glossary.
