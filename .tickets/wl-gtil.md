---
id: wl-gtil
status: open
deps: [wl-qpvr, wl-kh5w, wl-lvtw, wl-d5wn]
links: []
created: 2026-11-21T16:34:58Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Dense live grid and Match modal

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Replace the basic grid with a dense grid built and tested for up to 36 live Matches.
- **Tiles:** small, showing seat pips (alive or dead, roles in God View), phase, Day/Night number, step tag, alive count, Drama Score bar, a count of Players thinking, and timeouts.
- **Sort:** by Drama Score, alive count or Match number.
- **Filter:** all, flagged, voting or Night.
- **Promoted tiles:** the top 3 by Drama Score become large tiles showing the latest speech line.
- **Header:** a leaderboard strip of the top Agents by Overall Rating.
- **Match view:** opens as a modal over the live grid, and the grid keeps updating underneath. Esc, a backdrop click or the browser back button closes it. The URL carries the Match (e.g. #match=<id>), so links open straight into it.
- **Without the Narrator:** the grid must work fully before the Narrator ticket lands. Drama sorting falls back to Match number, there's no drama bar, the flagged filter is hidden, and promoted tiles are chosen by most recent activity.
- **Data:** tiles consume the League's coalesced per-tile diffs (wl-d5wn).
- **Scope boundary:** the modal content (seats, feed, God View panels) is wl-hozk's. This ticket owns the grid, the modal shell and the routing.
- **Design reference:** variant E on prototype/spectator-ui, from the prototype ticket this depends on. Use its recorded verdict.

## Acceptance Criteria

- [ ] The grid renders 36 live tiles from the League feed and stays responsive while they update
- [ ] Sort and filter work; with no Drama Scores present, drama sorting and the flagged filter degrade as described
- [ ] The top 3 promoted tiles show the latest speech line
- [ ] The header leaderboard strip updates live when a Match settles
- [ ] The modal opens from a tile or a #match=<id> link, closes via Esc, backdrop or back button, and the grid keeps updating underneath
- [ ] Usable on a projector-sized screen
- [ ] The featured finished-Match link from wl-af5m opens in the Match modal via #match=<id>


## Notes

**2026-11-21T16:37:12Z**

Design verdict (2026-11-21): build from variant E on prototype/spectator-ui (commit 03cd205, prototype/spectator-ui/variant-e.js, ?variant=E) as the starting design. The human will tweak the visuals during implementation and integration, so treat E as the baseline layout and behaviour, not pixel-final.

**2026-11-21T16:43:58Z**

Human decision 2026-11-21: the human wants to be involved in the final design pass. The implementer builds from variant E, then stops and reports with a runnable local build (wrangler dev plus fake League) for the human's review. The orchestrator does not merge wl-gtil until the human has done the design pass.
