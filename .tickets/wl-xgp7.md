---
id: wl-xgp7
status: open
deps: []
links: []
created: 2026-11-21T15:04:11Z
type: epic
priority: 0
assignee: Ryan Swift
tags: [spec, ready-for-agent]
---
# Spec: Werewolf League on Durable Objects

## Problem Statement

It's 9:22 at a hackathon that ends at 17:00, and I want to show how differently-configured Gemini Managed Agents play a social-deduction game against each other, in a way judges can watch and understand at a glance. Nothing exists today that runs AI Agents through full Werewolf Matches, ranks them fairly when roles are hidden and teams are uneven, and lets a spectator drop into any live Match and follow it. Managed Agent turns are slow and asynchronous, so a naive turn-by-turn design gives Matches too slow to watch.

## Solution

A Cloudflare Worker web app built around Durable Objects, with three kinds: a **League** DO, one **Match** DO per Match, and one **Player** DO per seat (ADR-0001). The League keeps a configurable number of Matches running at once with randomly drawn Agents. Each Match plays the Werewolf Ruleset. Each Player DO runs its seat's Gemini Managed Agent interaction chain, polling on its own alarm and enforcing turn deadlines. When a Match ends, the League updates each Agent's Wolf and Village Side Ratings (Elo) and their village Calibration (Brier) score.

Spectators open a grid of live Match tiles and click into any Match. On joining they receive the full event log, so they can drop in mid-Match, and then watch live. Narrator's View (on by default) reveals roles, Wolf Chat and a "who's lying" suspicion meter. A leaderboard ranks Agents by Overall Rating, and finished Matches can be replayed.

The core is ruleset-agnostic: League, Elo, Player and the spectator plumbing talk to a narrow Ruleset interface, and Werewolf is its only implementation.

## User Stories

### Spectating
1. As a Spectator, I want a home page showing a dense grid of every live Match (built for up to 36), so that I can see the whole League at a glance.
2. As a Spectator, I want each small Match tile to show seat pips, phase, Day/Night number, step tag, alive count, Drama Score, how many Players are thinking and timeouts, so that I can spot an interesting Match without reading text.
3. As a Spectator, I want the grid to update live without refreshing, so that the demo feels alive.
4. As a Spectator, I want to click a tile to open that Match's full view as a modal over the live grid, with its own link, so that I can follow it closely and share it.
5. As a Spectator, I want to receive the complete event log when I open a Match mid-way, so that I can catch up on what already happened.
6. As a Spectator, I want new events to stream in live after I join, so that I can watch the Match unfold.
7. As a Spectator, I want to close the Match modal (Esc, a backdrop click or the back button) at any time without affecting the Match, while the grid keeps updating underneath, so that I can drop in and out freely.
8. As a Spectator, I want Narrator's View on by default, showing every Player's role and the Wolf Chat, so that I can enjoy the dramatic irony.
9. As a Spectator, I want to turn Narrator's View off, so that I can play along with only the public information.
10. As a Spectator, I want each Player shown with its Display Name, Agent and copy number (e.g. "Mara · Hydrogen #2"), so that I can tell copies apart. Players see only Display Names, so that model identity never biases play.
11. As a Spectator, I want speeches in a Speech Round shown in the same order the agents were shown them, so that what I see matches what they saw.
12. As a Spectator, I want Accusations shown as visual links between Players, so that I can see who suspects whom.
13. As a Spectator, I want Claims (e.g. "I am the Seer; P3 is a Werewolf") shown as badges, so that I can follow claim wars and spot lies in Narrator's View.
14. As a Spectator, I want each vote shown with the voter's target (or Abstain) and short reason, so that I understand why someone was eliminated.
15. As a Spectator in Narrator's View, I want a Table Suspicion meter showing the table's average stated suspicion of each Player next to their true role, so that I can see who is fooling the table.
16. As a Spectator, I want deaths to reveal the dead Player's role, so that I know what was lost.
17. As a Spectator, I want a clear end-of-Match screen with the winning Side, all roles, and each Agent's rating changes, so that the result lands.
18. As a Spectator, I want to see when a Player timed out and received a default action, so that a strange move isn't mistaken for strategy.
19. As a Spectator, I want a "thinking…" indicator on Players whose turn is in flight, so that I know the Match isn't stuck (polling only shows completed actions).
20. As a Spectator, I want to open finished Matches as replays, so that I can show judges a great Match after it ended.

### Leaderboard
21. As a Spectator, I want a leaderboard that ranks Agents by Overall Rating (the mean of their Wolf and Village Side Ratings), so that I know who is best.
22. As a Spectator, I want Wolf Rating and Village Rating columns I can sort by, so that I can see who is a good liar and who is a good detective.
23. As a Spectator, I want a Calibration (Brier) column computed from village Players' beliefs, so that I can see which Agent reads the table most accurately.
24. As a Spectator, I want Matches played, wins per Side and timeout count per Agent, so that I can judge how meaningful each rating is.
25. As a Spectator, I want the leaderboard to update live as Matches finish, so that rankings visibly change during judging.

### League operation
26. As the operator, I want the League to keep N Matches running at once (default 24, started at a staggered pace) and start a new one whenever one finishes, so that the grid stays full without manual work.
27. As the operator, I want to change N live, so that I can trade spend against spectacle. This is demo-critical: it is the main cost and quota control.
28. As the operator, I want to pause and resume the League, so that I can stop spending between demos; pausing lets running Matches finish but starts no new ones. Demo-critical, even if its UI is cut.
29. As the operator, I want admin controls protected by a shared secret, so that judges can't change the League.
30. As the operator, I want each new Match to draw Agents at random from the roster (copies allowed) and deal roles at random from a recorded match seed, so that Matches vary and can be replayed deterministically.
31. As the operator, I want the dealer never to give both Werewolf seats to the same Agent, so that the mirror effect doesn't inflate Wolf Ratings.
32. As the operator, I want the roster defined in configuration (model + Agent Instructions + harness), so that I can add or remove Agents without code changes.
33. As the operator, I want seat count (7 or 8), Speech Round count, Right of Reply slots, whether Abstain is allowed, and turn deadlines to be configurable, so that I can tune pacing on the day.
34. As the operator, I want every interaction ID and environment ID saved before anything else happens, so that no in-flight agent turn is ever lost (there is no list endpoint).
35. As the operator, I want a Match to finish even if Agents time out or misbehave, so that no Match hangs forever.
36. As the operator, I want each Player's sandbox provisioned at Match start, so that the first turn doesn't wait on sandbox creation.

### Werewolf rules
37. As a Player, I want my Agent Instructions mounted as /.agents/AGENTS.md in my sandbox, and my first turn to give me the rules, my secret role, the seat list (by Display Name) and (for Werewolves) my partner, so that I can play.
38. As a Player, I want each later observation to contain only what's new since my last turn, the required action and the legal targets, so that turns are fast and cheap.
39. As a Player, I want the same tool set for my role for the whole Match, so that the agent API accepts every continuation (ADR-0002).
40. As a Player, I want an out-of-phase or illegal tool call to return an error naming the required action, so that I can correct myself before the deadline.
41. As a Werewolf, I want a private Wolf Chat with my partner each Night before we choose, so that we can coordinate.
42. As a Werewolf, I want the Pack Leader's choice to decide the kill when we disagree, with the role passing to the other wolf each Night, so that a split never stalls the Match.
43. As the Seer, I want to inspect one player each Night and privately learn their Side, so that I can find the Werewolves.
44. As the Doctor, I want to protect one player each Night (including myself, but not the same player two Nights running), so that I can save the Werewolves' target.
45. As a Player, I want the Match to start with Night 1, so that the first Day has a death to discuss.
46. As a Player, I want each Day to run two Speech Rounds in which everyone speaks at once, the second having seen the first, so that discussion is lively but fast.
47. As a Player, I want speeches presented in seat order starting from a seat that rotates each Day, so that no Player is always heard first.
48. As a Player, I want to attach optional Accusations, defences and a Claim to a speech, so that my position is unambiguous.
49. As an accused Player, I want Right of Reply when I'm among the 1–2 most-accused (Round A counted once, Round B twice, ties broken by the match seed, at most one reply each per Day), so that I can defend myself.
50. As a Player, I want one simultaneous plurality vote to end the Day, where I may Abstain, so that elimination is quick and fair.
51. As a Player, I want a tie or an all-Abstain vote to eliminate nobody, so that ambiguous votes don't kill at random.
52. As a Player, I want every vote to include my P(werewolf) for each other living player and a short reason, so that my reasoning is recorded.
53. As a Player, I want dead players to stop acting and their roles to be revealed, so that the game state is clear.
54. As a Player, I want the Village to win when all Werewolves are dead and the Werewolves to win when they equal or outnumber the Village, so that the Match has a clear end.
55. As a Player, I want the Werewolves to win if any survive after the 6th Day/Night cycle, so that every Match terminates.
56. As a Player, I want a turn that misses its deadline (60 s, or 90 s for my first turn) to get a default action (skipped speech, Abstain vote, no night action), so that one slow model doesn't stall the table.

### Ratings
57. As the operator, I want each Agent to hold a Wolf Rating and a Village Rating starting at 1200, so that skill on each Side is measured separately.
58. As the operator, I want each Match to update ratings by team-average Elo with K=32 (wolf team's average Wolf Rating vs village team's average Village Rating), applying one update per Player to that Player's Agent's Side Rating, so that copies count per seat.
59. As the operator, I want dead Players to share their team's result, so that sacrificial plays aren't punished.
60. As the operator, I want beliefs normalized server-side to sum to the number of living Werewolves, and only village Players' beliefs scored for Brier, so that calibration is comparable across models that over-sum probabilities.
61. As the operator, I want timeouts recorded per Agent and shown in Match stats, so that I can spot models that miss deadlines.

### Modularity
62. As a future developer, I want the Match runner, League, Elo and spectator plumbing to depend only on a Ruleset interface, so that a new Ruleset can be added without touching them.
63. As a future developer, I want the Harness to be an interface with a Managed Agent implementation, so that direct-call or self-hosted harnesses can be added later.
71. As a future developer, I want the Narrator behind an interface with a Decisions API implementation and a scripted fake, so that tests stay offline and deterministic.

### Scale and Narrator (added 2026-11-21 revision)
64. As a Spectator, I want to sort the grid by Drama Score, alive count or Match number, and filter it to all, flagged, voting or Night, so that I can find the action among dozens of Matches.
65. As a Spectator, I want the top 3 Matches by Drama Score promoted to large tiles showing the latest speech line, so that the best Matches are readable at a glance.
66. As a Spectator, I want a header strip showing the top Agents by Overall Rating, so that rankings stay visible from the grid.
67. As a Spectator, I want each tile to show a Drama Score and its active Drama Flags, so that I can tell which Matches are heating up.
68. As a Spectator with Narrator's View off, I want to see only public-safe Drama Flags, so that the Narrator never reveals secrets.
69. As the operator, I want the League to stagger Match starts and back off when Players hit rate limits (429), so that ramping up to N doesn't exhaust the Gemini quota.
70. As the operator, I want the Narrator never to block a Match or affect play, ratings, Calibration or Table Suspicion, so that a spectator feature can't break the game.

## Implementation Decisions

**Durable Object topology (ADR-0001).**
- **League DO** (one per League; two seeded, gemini-managed and pi-open, see wl-2lfo): holds roster, config, Side Ratings, Brier aggregates and timeout counts, runs scheduling (keep N Matches live, start a replacement on completion), offers pause/resume/set-N admin operations, and pushes the grid/leaderboard WebSocket feed. It keeps a lightweight summary per live Match, pushed to it by Match DOs.
- **Match DO** (one per Match): holds the match seed, seat assignment, Ruleset state and an append-only event log (SQLite). It drives the Ruleset, dispatches turns to Player DOs, collects actions, applies deadlines/defaults and broadcasts events to spectators over hibernatable WebSockets. On connect it sends the full log; for finished Matches it serves replays. When the Match ends it reports the result (Sides, Player→Agent, winner, normalized beliefs, timeouts) to the League.
- **PiSeatDO** (stretch, wl-zst1, ADR-0003): for seats on the `pi` Harness only, it hosts Pi Durable and is driven by that seat's Player DO through the Harness interface.
- **Player DO** (one per seat per Match): owns the seat's environment ID and interaction chain. It receives "take a turn" requests (observation + expected action kind + deadline), starts a background interaction, saves the interaction ID first, polls on its own alarm, enforces the deadline (cancels and reports a timeout), and returns the first valid custom function call to the Match DO. Filesystem tool calls already carry results and are ignored when picking the pending call.

**Ruleset interface (narrow, ruleset-agnostic).** Roughly: `setup(config, seed, seats) → state` (deals roles, declares Sides and each seat's fixed tool list), `nextStep(state) → step` (which Players must act now, the action kind, a per-Player observation delta, legal targets, or the final result), `applyActions(state, actionsBySeat) → state + public/private events` (validates and resolves simultaneous actions, with timeouts as defaults), `validate(state, seat, call) → ok | error message naming the required action`, `view(state, seat|spectator, godView) → visible events`, `result(state) → winner Side + per-Player Side`. All randomness inside the Ruleset comes from the match seed, which makes it deterministic and pure.

**Werewolf Ruleset.**
- Seats 7 (default) or 8: 2 Werewolves, 1 Seer, 1 Doctor, 3–4 Villagers. Sides: wolf, village.
- Night: Wolf Chat (2 exchanges, visible to wolves and Narrator's View only) → each wolf proposes a target; if they differ, that Night's Pack Leader (alternating) decides. Seer inspect and Doctor protect run in parallel with the final wolf choice. Doctor cannot protect the same player on consecutive Nights; self-protect allowed.
- Day: Speech Round A (all living players simultaneously) → Speech Round B (simultaneously, having seen A) → Right of Reply (1–2 slots; score = Accusations in A ×1 + in B ×2; ties broken by the match seed; skip players who already replied this Day) → one simultaneous plurality vote; Abstain allowed (configurable); a tie or all-Abstain means no elimination.
- Presentation order: a round's speeches are collected in parallel but listed in seat order from a starting seat that rotates each Day; the UI uses the same order.
- Win: Village wins when all wolves are dead; wolves win at parity; after the 6th cycle, wolves win if any remain alive. Dead roles are revealed.
- Defaults on deadline or invalid action: speech → skipped; vote → Abstain; night action → none (if both wolves time out, no kill).

**Agent tools (fixed per seat for the whole Match, ADR-0002).** All seats get `speak` and `vote`. Seer adds `inspect`, Doctor adds `protect`, Werewolves add `wolf_chat` and `choose_kill`. Never send an empty tool list. Shapes:
- `speak { text, accuse?: seat[], defend?: seat[], claim?: { role, results?: [{ seat, side }] } }`
- `vote { target: seat | "abstain", beliefs: { [seat]: P(werewolf) }, reason }`
- `inspect { target }`, `protect { target }`, `choose_kill { target }`, `wolf_chat { text }`

**Harness interface.** `startTurn(playerContext, input) → handle` and `poll(handle) → pending | action | error`, plus `provision()` for the environment. The Managed Agent implementation uses plain fetch REST against the Interactions API: `background: true`, `store: true`, explicit non-empty tools resent on every continuation, `previous_interaction_id` + `environment` on continuations, `max_total_tokens` ≈ 100k, and the new observation embedded inside the previous action's `function_result` (not a separate `user_input` step). First turn: rules + role + seats (by Display Name); the Agent Instructions are mounted as `/.agents/AGENTS.md` at provisioning (wl-cizy probe confirmed pickup), not sent in any turn input. Polling only; no streams, no webhooks.

**Deadlines.** Per-turn deadline 60 s, first turn 90 s, both configurable. Simultaneous steps wait for every Player or its deadline. Timeouts are recorded per Player/Agent.

**Ratings.** Side Ratings start at 1200, team-average Elo, K=32, one update per Player to its Agent's Side Rating, dead Players share their team's result; Overall Rating = mean of the two Side Ratings. Beliefs are normalized to sum to the number of living wolves (clamped to [0,1]); Brier is averaged over village Players' vote-time beliefs about the other living players' true wolf status. The Narrator's View suspicion meter is the table's mean normalized belief per Player.

**Agent Instructions (wl-cizy).**
- **Source:** `docs/agent-instructions/werewolf.md`. Its sections are shared, village, seer, doctor and werewolf; the text is strategy only, and the rules stay in the Ruleset briefing.
- **Assembly:** the Ruleset names each seat's section keys, the Match assembles them, and the Harness mounts the result as `/.agents/AGENTS.md` at provisioning. The first-turn input is the fallback if a function-only agent doesn't follow the mounted file.
- **Notes:** the `/notes.md` scratchpad is kept as a deliberate Managed Agents feature.
- **Speech limits** (≤3 sentences, ≤350 characters, plain text) are enforced by the instructions only; the rehearsal checks them.

**Display Names (wl-e9tp).** Each seat gets a seeded fake Display Name. Players only ever see Display Names, and spectators see "Display Name · Agent #n".

**Gemini 4 models and their jobs.** Hydrogen plays (with the Flash models on the gemini-managed roster), Neon analyzes finished Matches as a Managed Agent (wl-ofdn), and gemini-decision-1 narrates (wl-pbkx). Carbon as a second, sampled Analyst is a future follow-up.

**Roster (initial).** One Agent each for Hydrogen, 3.8 Flash, 3.6 Flash and 3.5 Flash-Lite, on the Managed Agent harness with shared agents.md-style Agent Instructions and no personas. Carbon, Argon and Neon are excluded. 3.8 Flash is kept only if the M1 sanity check shows its game-sized turns aren't much slower than Hydrogen's.

**Stack.** TypeScript; one Worker deployed with Wrangler; SQLite-backed DOs with WebSocket hibernation; React + Vite frontend served as Workers static assets; Gemini API key as a Wrangler secret; admin endpoints require a shared-secret header. Scripts calling the Worker must send an explicit User-Agent.

**Scale and League feed.** N defaults to 24 and is settable live; the grid and the feed are built and tested for 36.
- **Staggered starts:** the League starts at most 4 new Matches every 30 s (both configurable).
- **429 backoff:** when a Player reports a 429, the League stops starting new Matches for a backoff period (configurable, default 60 s) and records the event.
- **Coalesced feed:** Match DOs push tile summaries to the League. The League coalesces them and broadcasts small per-tile diffs to grid clients at most every ~500 ms (configurable), never one push per event. Leaderboard changes are pushed on settlement.
- **Owners:** wl-d5wn owns scheduling at scale and the feed (follow-up to the closed wl-kh5w); wl-gtil owns the dense grid and the Match modal (design: variant E, wl-qpvr).

**Narrator (stretch, go/no-go ~13:30, wl-pbkx).** `narrate(godViewLog) → { dramaScore, flags[{ id, value, visibility }] }`, with a `gemini-decision-1` implementation and a scripted fake.
- **When:** after each published step (dawn, each Speech Round, Right of Reply, vote), the Match DO sends the Narrator's View log to the Narrator. The Narrator sees roles, Wolf Chat and Seer results, because drama depends on what the wolves are doing.
- **Questions:** one score question (drama, calm to explosive) plus yes/no Drama Flags, each tagged public-safe or secret. Public-safe: claim war; vote on a knife edge; table split on who the wolves are; village eliminated its own power role. Secret: a wolf is fooling the table; wolves split in Wolf Chat.
- **Flags:** a flag is active at or above a threshold (default 0.7). Answers are never summed.
- **Output:** the result is stored as a Match event; secret flags are Narrator's-View-only, filtered like other private events. The Drama Score and active flags go into the tile summary. The bare Drama Score is shown even with Narrator's View off.
- **Throttling:** at most one call per Match is in flight, and a newer step supersedes a pending one. A failed or slow call (over ~5 s) is dropped, and the tile keeps its last value.
- **Isolation:** the Narrator never feeds play, observations, ratings, Calibration or Table Suspicion.

**HTTP/WebSocket surface (shape, not final paths).** Get the League snapshot (live Matches, leaderboard, config); a League WebSocket feed of coalesced per-tile diffs and leaderboard updates; get a Match's snapshot/event log; a Match WebSocket that sends the full log then live events, with Narrator's View filtering done client-side from a spectator view that includes private events; admin: pause/resume, set N, set config.

**Milestones.**
- M1 (~10:30): sanity check. One short game-sized chain each on Hydrogen and 3.8 Flash.
- M2 (~12:00): Ruleset + Match + Player running one full Match, with logs.
- M3 (~13:30): League scheduling + Elo/Brier.
- M4 (~15:00): dense grid with Match modal, Match view, leaderboard.
- Narrator: stretch, with a go/no-go call at ~13:30 based on wave 2.
- M5 (~16:00): deploy, Narrator's View toggle, replays, polish.
- Freeze 16:30. If behind at 14:00, cut replays and admin controls first.

## Testing Decisions

- Good tests exercise external behaviour only: what a Spectator or the League can observe (event log, WebSocket messages, leaderboard values), never internal DO storage layout or private helpers.
- **Seam 1: Harness.** A scripted Fake Harness replaces Gemini. Whole-system tests run in the Workers runtime with `@cloudflare/vitest-pool-workers`. They create a League with scripted Agents, drive real League/Match/Player DOs and alarms, and check: a Match runs to a correct result; the event log and WebSocket feed (full log on join, then live); rating changes and Overall Rating; normalized Brier; timeout defaults and per-Agent timeout counts (a fake that never answers); invalid-call error feedback; pause and N behaviour; no same-Agent wolf pairs; deterministic replay from the seed.
- **Seam 2: Ruleset interface.** Pure tests of the Werewolf Ruleset with hand-written actions: night resolution (wolf split → Pack Leader, Doctor save, consecutive-protect rule), Right of Reply scoring/ties/repeat-skip, presentation order rotation, plurality/tie/all-Abstain, win conditions and the 6-cycle cap, defaults on timeout, out-of-phase validation messages.
- **Seam 3: Narrator.** A scripted fake Narrator in the same whole-system tests checks that: results become events and reach tile summaries; Narrator's View tagging hides secret flags; a failing or slow Narrator never blocks a Match; at most one call per Match is in flight.
- Elo, normalization, reply selection, feed coalescing and start staggering are tested only through these seams.
- Real Gemini calls happen only in the M1 sanity check and a manual smoke test before the demo, never in CI.
- Prior art: none (greenfield repo). The M1 probes in `~/dev/personal/managed-agents-testing` show working request shapes.

## Out of Scope

- Rulesets other than Werewolf (only the interface is built).
- Direct-call (plain model) and self-hosted harnesses (stretch goal only if M5 is done by 15:30). Exception: a Pi Durable harness with Agent37 sandboxes and OpenRouter models is planned as stretch ticket wl-zst1, after the rehearsal passes.
- Create-agent UI (stretch goal under the same condition).
- Personas; Carbon, Argon and Neon Agents.
- Cross-League Elo (Elo stays within a League; Leagues are compared on absolute metrics in wl-9u76).
- Extra roles (Hunter, Witch, sheriff) and alternative Day formats beyond the configurable round/reply counts.
- Streaming of agent output, live reasoning display and thought summaries.
- Persistent cross-Match agent memory (environments are per Player per Match).
- User accounts or authentication beyond the admin shared secret.
- Correcting Elo for role-side bias.

## Further Notes

- Measured facts behind these decisions are in `~/dev/personal/managed-agents-testing/FINDINGS.md`: per-turn latency (Hydrogen ~13 s typical; ~1 in 7 continuations takes ~40 s), no list endpoint, `requires_action` survives ≥46 h, single stream per interaction, and `tools: []` meaning default tools.
- **Match throughput:** Matches take roughly 15–25 min. At the default N=24 that's about 58–96 Matches an hour; at N=36, about 86–144.
- **Cost:** on the fast roster a Match costs about $1–1.5 (Hydrogen-only ~$2, Flash ~$1, Flash-Lite ~$0.35; FINDINGS §9). The "~$4 mixed table" figure included Neon. That's ~$60–145/hour at N=24 and ~$85–215/hour at N=36, roughly 9–35 hours of the $2000 credit. The Narrator adds ~$0.05–0.15 per Match. Pause/resume and set-N are the cost controls and are demo-critical.
- **Quota risk:** 100 concurrent agents were measured with no errors (FINDINGS R2-8). With parallel Days that is ~12 Matches fully in flight. N=24 (~192 seats) and N=36 (~288) are unmeasured, and fresh sandbox creation in bursts takes 9–15 s. Staggered starts, 429 backoff and the rehearsal ramp test (wl-t4no) handle this; the demo N and a fallback N come from the ramp test.
- Function-only agents don't randomize. That's fine, because all game randomness is server-side from the match seed.
- Vocabulary follows `GLOSSARY.md`; architecture follows `docs/adr/0001` and `0002`.


## Notes

**2026-11-21T15:13:06Z**

Revisions after review (2026-11-21); the child tickets carry the details:
- Release gate moved forward: ticket wl-t4no is now a deployed one-table rehearsal at ~14:00 (join mid-Match, see a real Accusation and vote, leave and rejoin, see the leaderboard change, measure time to first speech and first result, then choose N and the roster). Replay playback controls are stretch scope; a pinned featured finished-Match link is core scope. Operator pause is core scope.
- The 6-cycle cap moved to the walking skeleton. Committed events have sequence numbers; observations are frozen when a step starts; a round is published in presentation order only after it fully resolves. An identical event log means the same game decisions in the same order.
- Timeout recovery: a seat that times out once acts normally on its next turn (continuation timeout: answer the pending parent call; first-turn timeout: fresh chain on the same environment with a catch-up observation). Late results are dropped by turn ID. A Match backstop alarm expires turns that are never reported. wl-cpl1 owns timeout counting.
- Settlement is idempotent by Match ID: rating changes come from a pre-Match snapshot and are persisted, and a retry returns the same deltas and starts no second replacement.
- Beliefs: each ballot is normalized to the wolves among the voter's other living seats (village voter W, wolf voter W-1), capped at 1 with the excess redistributed; all-zero or missing becomes uniform; a timeout has no ballot; Brier uses village ballots only. The meter is renamed Table Suspicion and includes wolf ballots; wl-bfo1 owns it, and Narrator's View only toggles it.
- Dealing: the Ruleset owns the deal (wolves on different Agents, or a setup error); the League draws at least 2 distinct Agents, redraws deterministically on rejection, and refuses rosters of fewer than 2. If only one wolf submits a kill, that is the kill. No Accusations means no Right of Reply. A timed-out vote is always an Abstain.
- New edges: wl-t4no depends on wl-lvtw and wl-jb4x; wl-lvtw depends on wl-cpl1.

**2026-11-21T20:14:48Z**

Human decisions 15:14: code freeze at 16:30, with 16:30-17:00 for the human's demo video. The deployed League has NO spend cap from now on (spendCap null; the key is effectively unlimited for normal use). Demo runs at N=8 (TPM quota), Narrator and Analyst on, Analyst concurrency ~2.

**2026-11-21T20:26:17Z**

Final code review (15:26, main...integration/wl-xgp7, two axes): no P0/P1. Standards P2s: 'game' wording in Agent-facing prompts (src/harness/managed-agent/index.ts:74-75, src/core/analyst.ts:57, src/rulesets/werewolf/narration.ts:13,78; deferred, because changing prompts at the freeze is risky); the Analyst as sentinel seat 0 repeated in match.ts; role-to-side logic duplicated in web/; duplicate event describers (server vs web); EventDescriber alias bypassed in night.ts; devVarsSecret() copied across scripts; large match.ts/league.ts. Spec P2s: thinking and timeout markers hidden with Narrator's View off (fix pass); pause can still launch an already-reserved Match within milliseconds; configure() clears the spend-cap block (fix pass); the one-off admin Match route is unticketed. Fix pass impl/review-fixes: Day-step markers public, role display names in death reveals, spend-cap block clearing.

**2026-11-21T20:34:50Z**

Final review fix pass merged (impl/review-fixes 182d584): Day thinking and timeout markers are public (Night stays Narrator's-View-only); death and role reveals use display names; configure() keeps a spend-cap block unless the cap is lifted. Implementer: 293/293, codex clean. Remaining review P2s are recorded above.

**2026-11-21T21:24:52Z**

Live config 16:24 (human-approved): gemini-managed N=7 (TPM headroom for the Neon Analyst; 429s went from 35 to 41 after Neon came on) and turn deadline 75 s (firstTurn 90 s unchanged) to cut 3.8 Flash timeouts (21 vs 0-2 for the others). pi-open N=1 on the 7-model roster (40 GB Agent37 limit). Analyst on (Neon, concurrency 2); first deployed report: Match 82. Deployed version fc3c8293. main and integration/wl-xgp7 pushed by the human. Worktree cleanup deferred until after the demo video.
