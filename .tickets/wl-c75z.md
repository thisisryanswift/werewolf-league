---
id: wl-c75z
status: open
deps: [wl-gtil]
links: []
created: 2026-11-21T18:04:53Z
type: task
priority: 2
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Help modals: How to play and About this project

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md.

## What to build
Two header buttons on the grid, each opening its own modal: a native <dialog>, closed with Esc, a backdrop click or a close button. They reuse the wl-gtil modal styling, and the grid keeps updating underneath. Use the modern-web-guidance skill.

**How to play (Werewolf in ~60 seconds of reading):** the Sides and roles (Werewolves, Seer, Doctor, Villagers); Night (Wolf Chat, kill, inspect, protect) vs Day (Speech Rounds, Right of Reply, vote, Abstain); win conditions and the 6-cycle cap; how to read the screen (seat pips, Accusation arcs, Claim badges, vote tally, Table Suspicion, Drama Score and Drama Flags); what the Narrator's View toggle reveals.

**About this project (FAQ):** short Q&As, for example:
- What is this? A league of AI Agents playing Werewolf, ranked by Elo.
- What's an Agent? A model + Agent Instructions + Harness.
- How is it built? A Worker with League, Match and Player Durable Objects; each Player runs a Gemini Managed Agent in its own sandbox with mounted AGENTS.md (plus Pi seats if wl-zst1 lands).
- How are Agents ranked? Wolf and Village Side Ratings, the Overall Rating, Calibration.
- What does the Narrator do? It scores drama and never affects play.
- What do Agents see? Only their Display Names; never which model is in a seat.
- What does a Match cost? Live figure if wl-64dn has landed, otherwise omit.
- Link to the repo.

**Copy sources (2026-11-21):** How to play is drafted at docs/help/how-to-play.md, from our own Ruleset rather than generic Werewolf guides. The human is writing the About/FAQ copy at docs/help/about.md. Render both files (markdown to HTML at build time, or imported as text) so the copy stays editable in one place per modal. If about.md is missing when you start, show a placeholder and flag it on this ticket. Previous plan: an agent drafts both texts from the spec and GLOSSARY.md, using glossary terms and plain language, each under ~250 words. Keep the copy in a single file so the human can edit it without touching components. The human reviews the copy before freeze. Content that depends on unlanded stretch tickets (Pi, cost) is shown only if those features exist.

## Acceptance Criteria

- [ ] Both buttons are in the header and open their own modal; Esc, backdrop and close button all work; focus returns to the button
- [ ] Copy uses GLOSSARY.md terms (Narrator's View, never God View) and fits on a projector without scrolling past a screen or so
- [ ] Copy lives in one editable file; the human has reviewed it (noted on this ticket)
- [ ] Nothing about unlanded features is shown

