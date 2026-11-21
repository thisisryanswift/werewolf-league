---
id: wl-qpvr
status: closed
deps: []
links: []
created: 2026-11-21T16:34:58Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [prototype, ready-for-human]
---
# Prototype variant E: dense Match grid

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
In the werewolf-league-ui worktree (branch prototype/spectator-ui), add variant E to the existing switcher. It is a dense grid for 24-36 live Matches:
- small tiles with seat pips, phase, Day/Night number, step tag, alive count, Drama Score bar, a count of Players thinking, and timeouts;
- sort by Drama Score, alive count or Match number;
- filter to all, flagged, voting or Night;
- the top 3 Matches by Drama Score promoted to large tiles with the latest speech line;
- a header strip of the top Agents by Overall Rating;
- the Match view as a modal over the live grid (Esc, a backdrop click or the back button closes it; the URL carries the Match).
Reuse the visual style you liked from variants A-D. The prototype stays throwaway; the verdict is recorded on the dense-grid ticket.

This is human-driven work in the prototype session. The orchestrator does not pick it up.

## Acceptance Criteria

- [ ] Variant E is committed on prototype/spectator-ui and switchable via ?variant=E
- [ ] It renders a believable 24-36 Match grid from fake data, including promoted tiles, sort/filter controls and the modal
- [ ] The chosen direction is recorded as a note on the dense-grid ticket


## Notes

**2026-11-21T16:37:12Z**

Done: variant E committed as 03cd205 on prototype/spectator-ui. Verdict recorded on wl-gtil (start from E; tweaks to come during implementation).
