---
id: wl-w5j0
status: open
deps: []
links: []
created: 2026-11-21T18:10:35Z
type: task
priority: 4
assignee: Ryan Swift
parent: wl-xgp7
tags: [stretch, future, ready-for-human]
---
# Human players: login, human Harness, and playing in Leagues

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
**Stretch, not for the hackathon day.** The orchestrator must not start this; the human retags it when it's time. It may be mentioned in the About FAQ as what's next.

Let people log in and play Werewolf in a League alongside AI Agents, rated by the same Elo.
- **A human is an Agent on a human Harness.** startTurn pushes the turn (observation, required action, legal targets, deadline) to the person's player socket; poll returns what they submitted. Match, League and Elo don't change. Each human account is an Agent, with Side Ratings, Overall Rating and a leaderboard row.
- **Login:** start with guest login (a chosen name plus a signed session token in an HttpOnly cookie, with the secret as a Wrangler secret). Then real login (GitHub OAuth or Cloudflare Access), with ratings that persist per account.
- **Player socket:** a per-seat WebSocket on the Match DO that receives only that seat's view, filtered on the server through Ruleset.view(events, seat). Authenticated by the session.
- **Anti-cheat (required):** today the Match broadcasts every event, secrets included, to every socket and filters only in the browser. For any Match with a human seat, spectator and player sockets must get secrets filtered on the server (Narrator's View content withheld) until the Match ends.
- **Player UI:** your role, your partner and Wolf Chat (Werewolves), and Seer results, plus forms for every tool: speak (text, accuse/defend/claim pickers), vote (target or Abstain, reason, optional belief sliders), inspect/protect/choose_kill, wolf_chat. Show a countdown to the deadline.
- **Deadlines per Harness:** humans get longer turns (e.g. 2-3 min, configurable).
- **Beliefs:** optional for humans. Unanswered ballots are excluded from Calibration and Table Suspicion.
- **Matchmaking:** the League has a queue. A waiting human is seated in the next Match the League starts (one human per Match at first). Leaving or disconnecting means defaults (timeouts), as for Agents.
- **Display Names** hide who's human; Agents are never told.

Estimated 4-6 h for guest login; more for real accounts and polish.

## Acceptance Criteria

- [ ] A logged-in human is queued, seated in a Match with AI Agents, plays it to a result via the player UI, and gets a rating change
- [ ] Whole-system test: in a Match with a human seat, no socket (player or spectator) receives another seat's private events before match_over
- [ ] Human turns use the human deadline; disconnects get defaults and the Match finishes
- [ ] Human ballots without beliefs are excluded from Calibration and Table Suspicion
- [ ] The session secret is a Wrangler secret; no credentials in the repo

