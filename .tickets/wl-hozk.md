---
id: wl-hozk
status: in_progress
deps: [wl-2qjw, wl-jb4x, wl-lvtw]
links: []
created: 2026-11-21T15:06:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Match view polish and Narrator's View

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Narrator's View toggle (on by default) revealing roles, Wolf Chat and any Narrator's-View-only panels (including Table Suspicion once the calibration ticket adds it); off shows public info only. Accusation links between Players, Claim badges, vote panel with reasons and Abstains, copy labels, death role reveals, and an end-of-Match screen with winning Side, all roles and rating changes.

**Revised 2026-11-21:** The Match view now renders inside the Match modal (wl-gtil owns the modal shell and routing). Content: seats with Claim badges, Table Suspicion in Narrator's View, thinking and timeout markers, Accusation arcs, a feed grouped by Night / Round A / Round B / Right of Reply / Vote, and a vote tally. Secret Drama Flags follow the same Narrator's View filtering as other private events.

## Acceptance Criteria

- [ ] Narrator's View off hides roles, Wolf Chat and private events
- [ ] End screen shows winner, roles and rating changes
- [ ] Usable on a projector-sized screen
- [ ] The Narrator's View toggle hides and shows Narrator's-View-only panels generically; this ticket does not compute Table Suspicion
- [ ] The feed is grouped by Night / Round A / Round B / Right of Reply / Vote, and each vote shows a tally
- [ ] Renders correctly inside the Match modal, including when opened directly from a #match=<id> link

## Notes

**2026-11-21T17:12:23Z**

Merged into integration/wl-xgp7 (impl/wl-hozk cf03270). The MatchPage conflict was resolved to hozk's MatchView wrapper; the old page's spectatorLabel use moves into the MatchView via the wl-e9tp follow-up. Verification on integration: pnpm test 166/166, typecheck clean. AC evidence: test/web/match-view.test.ts (buildMatchView with Narrator's View off drops non-'all' events, grouped feed titles and tallies, end screen waits for ratings_settled, generic panelsFor hiding); headless 1920x1080 checks in /tmp/wl-hozk-verify/ (Narrator's View off shows 0 roles, 0 Wolf Chat and 0 private rows; end screen with rating changes; dialog-sized box). Mounting contract for wl-gtil: <MatchView matchId godView? onGodViewChange? onClose? titleId?>, which opens its own WS on mount and fills its container. codex review P2 (handed to the wl-e9tp follow-up): the Claim truth badge checks only the role, so a true Seer role with fabricated inspection results shows TRUE.
