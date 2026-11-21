---
id: wl-2qjw
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
# Night roles: Seer, Doctor, Wolf Chat, Pack Leader

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Extend the Werewolf Ruleset Night: Wolf Chat (2 exchanges, visible to wolves and God View only), each wolf proposes a kill, the Night's Pack Leader decides on a split and the role alternates each Night; Seer inspects one player and privately learns their Side; Doctor protects one player (self allowed, not the same player on consecutive Nights). Seats get their fixed role tools (inspect, protect, wolf_chat, choose_kill). Night events appear on the Match page.

**Revised after review:** The Ruleset owns the whole deal. From the seat-to-Agent list and the match seed it assigns roles, choosing the two Werewolf seats from different Agents; if that's impossible (every seat is the same Agent), setup returns an error. If only one wolf submits a kill, that proposal is the kill even if that wolf isn't the Pack Leader.

## Acceptance Criteria

- [ ] Ruleset tests: wolf split resolved by the alternating Pack Leader; Doctor save cancels the kill; consecutive-protect rejected with a message naming the rule; Seer receives the correct Side privately
- [ ] Wolf Chat and Seer results are absent from village Players' observations
- [ ] Whole-system test with fake Agents covers a 7-seat Match with all roles
- [ ] Ruleset tests: a deal never puts both Werewolf seats on one Agent; an all-one-Agent seat list returns a setup error; the same seed gives the same deal
- [ ] Ruleset test: when only the non-leader wolf submits a kill, that target dies (unless protected)

## Notes

**2026-11-21T16:17:49Z**

Merged into integration/wl-xgp7 (3219019; impl/wl-2qjw 5b67ae5). codex review: no findings. Verification on integration: pnpm test 53/53, typecheck clean. AC evidence: test/werewolf/night-roles.test.ts (Pack Leader split and alternation, Doctor save, consecutive-protect error naming the rule, Seer side sent privately, lone non-leader wolf kill); a Night privacy test (village observations contain no Wolf Chat or Seer results); test/system/night-roles.test.ts (7-seat Match with all roles through real DOs); test/werewolf/deal.test.ts (different-Agent wolves over 200 seeds, all-one-Agent setup error, same seed gives the same deal). In a wrangler dev headless run the Match page showed Wolf Chat, the Seer result, the Pack Leader kill and the Doctor save. New event kinds: wolf_chat, kill_decided, seer_result, protect_chosen, doctor_saved (God View only). The fake harness gained a 'say' option.
