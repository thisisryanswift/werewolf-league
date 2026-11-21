---
id: wl-kh5w
status: closed
deps: [wl-b8rj]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# League scheduling and live grid

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
League DO keeps N Matches live (default 6). When a Match finishes it starts a replacement: Agents drawn at random from the roster (copies allowed, labelled #1/#2), roles dealt from a recorded match seed, never both Werewolf seats to the same Agent. Admin operations behind the shared secret: pause (running Matches finish, no new ones), resume, set N. Home page is a live grid of Match tiles (phase, Day/Night number, alive Players, latest speech) fed by a League WebSocket; clicking a tile opens the Match page.

**Revised after review:** The League draws seats so that at least 2 distinct Agents appear. If the Ruleset rejects a deal, the League redraws deterministically from the seed, and it refuses to start Matches when the roster has fewer than 2 Agents. Settlement is idempotent: the Match retries delivering its result until the League acknowledges it, and a duplicate result for an already-settled Match never starts a second replacement. Operator pause is core scope even if its UI gets cut.

## Acceptance Criteria

- [ ] Whole-system test: League keeps N Matches running and replaces finished ones; pause stops new Matches; set N takes effect
- [ ] No Match ever has both Werewolf seats on one Agent
- [ ] Admin operations reject requests without the secret
- [ ] Grid updates live and tiles link to Match pages
- [ ] Whole-system test: a result delivered twice (first acknowledgement lost) starts exactly one replacement Match
- [ ] A roster of fewer than 2 Agents is refused, and a rejected deal is redrawn deterministically

## Notes

**2026-11-21T16:27:22Z**

Merged into integration/wl-xgp7 (81f2874; impl/wl-kh5w with the codex P2 CSS brace fix). Verification on integration: pnpm test 74/74, typecheck clean. AC evidence: test/system/league.test.ts (keeps N live and replaces finished Matches; pause stops new starts; set N; admin routes return 401 without the secret; a result delivered twice after a lost ack starts exactly one replacement; a 2-Agent roster gives different-Agent wolves over 10+ Matches); test/league/draw.test.ts (deterministic redraw; rosters under 2 refused with 400). A wrangler dev WS client and headless Chromium showed live tiles linking to /matches/<id>. Contracts: GET /api/league, /api/league/ws, POST /api/admin/league/{pause,resume,config}; a fresh League starts paused with fakeRoster(); settlement hook LeagueDO.settle() for wl-lvtw. Known limit: a start that keeps failing loops every LEAGUE_RETRY_MS, with the reason shown in 'blocked'.
