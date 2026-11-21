---
id: wl-fuy2
status: in_progress
deps: [wl-2lfo]
links: []
created: 2026-11-21T20:06:38Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Match tile redesign (design review verdict)

## Parent
Spec wl-xgp7. Vocabulary: GLOSSARY.md. Design source: the tile lab (prototype/spectator-ui/tile-lab.html, commit 9fb2fee on prototype/spectator-ui, variants A-D) and the six-model review in ~/dev/personal/werewolf-league-ui/tmp/critique/2026-11-21-match-tile-page/ (decisions.md, synthesis.md, combined/index.html and the combined-nv1/nv0.png mock). The human approved the settings below.

## What to build
Rebuild the grid Match tile (web/grid/LeagueGrid.tsx and its CSS) on variant C ('Headline'), borrowing from A, B and D. The goal is a calmer, less busy tile that reads on a projector without hover.

**Every tile:**
- **Top line**, 14px at full opacity: 'MATCH N · phase chip (D3 / N1 / END) · step'. Small tiles use short step labels ('Speech A', 'Speech B', 'Reply', 'Vote', 'Night').
- **Headline (from C):** the result when Over (e.g. 'Werewolves win'). Otherwise the top visible Drama Flag name, else 'Night falls' (Night) / 'The table votes' (Vote) / the step. Flag names truncate with '…' rather than wrap.
- **Fill:** Night tiles are navy #1d1b3a with light text (from C). Other tiles are white, or yellow #ffe500 when Drama Score >= 0.70 and the Match isn't finished.
- **Drama (from D):** a big number in a fixed top-right spot, ~40px on large tiles and ~24px on small, colour #111111 (light on Night). Show '—' when there's no Narrator data, so the layout never shifts. The word 'drama' appears under it on large tiles only.
- **Pips (from A):** squares with W/S/D letters in Narrator's View and × for dead; 22px large, 18-20px small. Villager pips on teal #1f9e8a use #111111 letters, not white (contrast).
- **Speaker mark (from B):** a 3px #111111 ring with a 2px #ffffff gap on the current speaker's pip (a #ffffff ring on Night tiles). None once Over.
- **Timeouts:** a '⏱ N' white-on-black chip only when N > 0.

**Large (promoted, top 3 by drama) tiles only:**
- the latest quote in Inter (not Georgia), clamped to 2 lines, cited by Display Name only (Agent labels belong in the Match modal);
- an 'Also:' line with at most 1 more flag + '+N'; secret flags are dashed;
- the thinking count.

**Removed:** A's drama bar, the '⚑ N' sticker, the always-yellow large tile, the 'N/7' alive count, Village vs Wolves, cost on tiles, D's edge strip, B's round table and colour-mix backgrounds.

**Bugs and contrast fixes:**
- With Narrator's View off, the thinking count on Night tiles is hidden (it reveals who acts at Night).
- The Night 'No one has spoken yet.' placeholder uses #d2d1d8 (10.91:1 on navy).
- Any muted grey text on white uses at least #555555. Check every new text/background pair against WCAG AA.

**Sizes:** large tiles ~600 × ~200px; small ~300 × ~120px; 12px gaps. Text floors: headline >= 32px large and >= 20px small; quote >= 18px; small text >= 14px. The leaderboard strip and the sort/filter bar stay visible above the grid at 1920×1080.

**Data:** add an optional result (winner Side label) to the Match summary when the Match ends, so finished tiles can say 'Werewolves win' / 'Village wins'. Tiles keep working without it (headline falls back to 'Over').

**Timing:** start right after wl-2lfo merges, which also edits LeagueGrid.tsx, and before wl-liwr. Feature cutoff ~15:30. Do the 'Every tile' and 'Removed' items first; large-tile extras second.

## Acceptance Criteria

- [ ] Tiles match the spec in all six lab states (Night start, Speech Round, hot Vote with claim war, Right of Reply, Over, no Narrator data) at large and small size, with Narrator's View on and off
- [ ] Narrator's View off: no secret flags, no roles on pips, no Night thinking count
- [ ] All text/background pairs meet WCAG AA (list the computed ratios in a note)
- [ ] The finished-Match headline shows the winner via the new result field, falling back to 'Over'
- [ ] At 1920×1080 the header strip, sort/filter bar, 3 large tiles and at least 3 rows of small tiles are visible without scrolling
- [ ] Before/after screenshots of the deployed or local grid are attached in a note


## Notes

**2026-11-21T20:13:16Z**

Orchestrator: started at 15:13, before wl-2lfo lands, to hit the human's ~15:30 target for core items; merges wl-2lfo (the League switcher in the grid header) when it lands. Core items first, large-tile extras second.
