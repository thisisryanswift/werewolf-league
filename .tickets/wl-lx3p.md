---
id: wl-lx3p
status: in_progress
deps: []
links: []
created: 2026-11-21T20:09:09Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Replace Accusation arrows with per-seat chips in the Match view

## Parent
Spec wl-xgp7. Vocabulary: GLOSSARY.md.

## What to build
The Accusation arcs in the Match modal's seat list don't work: every arc shares a narrow left gutter, so with several accusations they blend together. Remove the arcs and show Accusations as text on each seat card instead.
- **Chips per seat card, for the current Day** (from the speak events' accuse[] in Speech Rounds A and B and Right of Reply):
  - '← accused by P2 · P3' (incoming),
  - '→ accuses P5' (outgoing).
  Use seat numbers plus Display Names where space allows. defend[] may show as '♥ defends P4' if it fits without crowding; otherwise skip it.
- **Count badge:** the seat(s) with the most accusations this Day get a badge with their count (e.g. '🎯 3'), matching the Right of Reply weighting the Ruleset uses (Round B counts double) so it explains who gets Right of Reply. Repliers get a 'Reply' tag.
- **Between Days:** chips reset at each new Day. Once the Match is Over, show the final Day's chips.
- **Narrator's View doesn't apply:** Accusations are public, so the chips show with Narrator's View on or off.
- Update docs/help/how-to-play.md 'Reading the screen' ('Arcs show Accusations' becomes chips) in the same change.

## Acceptance Criteria

- [ ] No arcs remain; each seat shows incoming and outgoing Accusation chips for the current Day
- [ ] The most-accused badge and Reply tags agree with the Right of Reply the Ruleset actually selected (test with a scripted Day)
- [ ] Readable at projector distance; chips wrap without overlapping seat content
- [ ] how-to-play.md updated


## Notes

**2026-11-21T20:25:56Z**

Merged into integration/wl-xgp7 (impl/wl-lx3p d1ea5f1). Typecheck clean; web and werewolf tests pass on integration (implementer's full suite had only the known timing flakes). AC1-3 met: test/web/match-view.test.ts (chips per seat, reset at a new Day, final Day once Over, identical with Narrator's View on and off; badge and Reply tags equal replier_chosen; Round C weighting); live check at 1920x1080 with no arcs and no chip overflow (/tmp/wl-lx3p-verify/midday-narrator-on.png). AC4 OPEN: docs/help/how-to-play.md line 26 still says 'Arcs' and needs the human's copy edit (suggested text is in the implementer report).
