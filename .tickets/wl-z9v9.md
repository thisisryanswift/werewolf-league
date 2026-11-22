---
id: wl-z9v9
status: closed
deps: [wl-t4no]
links: []
created: 2026-11-21T17:11:03Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-human, demo]
---
# 1-minute demo video

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md.

## What to build
A ~60-second demo video for the hackathon submission, which also serves as the backup if the live demo or Wi-Fi fails. The human records it and an agent polishes it.

**Record (human, on the deployed app with real Agents):** about 90 s of raw footage, enough to cut down to 60 s.
1. The live dense grid with many Matches running.
2. Click into a Match: the modal opens. Show speeches with Accusation arcs and Claims, Narrator's View roles and Wolf Chat, Table Suspicion.
3. A vote resolving: tally, reasons, an elimination with its role reveal.
4. Close the modal (the grid is still live), then the leaderboard changing after a Match settles.
5. Optionally, a Drama Score or Drama Flag on a tile if the Narrator has landed.

**Polish (agent, with the HyperFrames skills):** title card (project name plus a one-line pitch: Gemini Managed Agents playing Werewolf on Cloudflare Durable Objects, ranked by Elo); 3-5 short captions naming what's on screen (League, Match, Player Durable Objects; Managed Agents with mounted AGENTS.md; Elo per Side); an end card with the repo URL. Total length 55-65 s, 1080p, legible on a projector. Captions use GLOSSARY.md terms.

**Timing:** record after the rehearsal (wl-t4no) passes, ideally ~15:30-16:15 while the League is busy. Polish so it's done by ~16:45, before the 17:00 deadline.

**Privacy:** the footage shows only the app and its public URL. No dashboard, no terminal, no API keys, account IDs, emails or admin secret (keep admin controls off-screen).

## Acceptance Criteria

- [ ] Raw footage recorded on the deployed app with real Agents, covering steps 1-4
- [ ] Final video is 55-65 s, 1080p, with title card, captions and end card
- [ ] No secrets, account IDs, emails or admin controls visible in any frame
- [ ] The final file is saved outside the repo (or in a gitignored path) and its location noted on this ticket


## Notes

**2026-11-21T20:18:27Z**

Human decision 15:18: the human records with OBS and a live voiceover; no HyperFrames/agent polish pass.

**2026-11-22T01:19:37Z**

Done: the human recorded the demo video (OBS, live voiceover) on the deployed app.
