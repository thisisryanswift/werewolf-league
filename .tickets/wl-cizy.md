---
id: wl-cizy
status: closed
deps: []
links: []
created: 2026-11-21T16:46:39Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [ready-for-agent]
---
# Mount Agent Instructions as each seat's AGENTS.md

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
Deliver the Agent Instructions in docs/agent-instructions/werewolf.md the native Managed Agents way: as /.agents/AGENTS.md in each Player's sandbox.
- **Sections:** an Agent's instructions are keyed text sections, parsed from the file's <!-- section: NAME --> markers. Everything above the first marker is for humans and is never mounted.
- **Ruleset names the keys:** the Ruleset interface gains a way to name a seat's section keys, in order. Werewolf: Villager = shared, village; Seer = shared, village, seer; Doctor = shared, village, doctor; Werewolf = shared, werewolf.
- **Match assembles:** the Match DO assembles the text and passes it to the Harness at provisioning. The Harness and League never learn roles.
- **Managed Agent harness:** writes the assembled text to /.agents/AGENTS.md in the seat's environment before the first turn. Use a documented environment file or inline-source mechanism; check the gemini-managed-agents skill and the agent-environment docs. A fresh chain on the same environment, after a first-turn timeout, keeps the mounted file.
- **Verify first:** start with a short real probe. With a function-only tool list, does the agent follow an instruction that appears only in the mounted AGENTS.md (for example a canary argument value)? Record the result as a note on this ticket.
  - If pickup works: stop putting the instructions into the first-turn input, to avoid duplication.
  - If it doesn't: keep the existing first-turn path, which already re-sends the text after a restart, and record that.
- **Keep the notes scratchpad.** The text tells agents to keep /notes.md, as a deliberate Managed Agents feature.

## Acceptance Criteria

- [ ] Real probe result recorded: does a function-only agent follow mounted AGENTS.md? Delivery path chosen accordingly
- [ ] Whole-system test (Fake Harness records what it was given): each seat receives exactly its Ruleset-named sections in order, and no seat ever receives another role's section (a Werewolf gets shared and werewolf only)
- [ ] The Harness and League code contain no role names
- [ ] A real local Match shows Agents behaving per the instructions (short speeches, accuse/defend fields filled in)


## Notes

**2026-11-21T17:08:02Z**

Real probe (gemini-4-hydrogen, function-only tool list [vote], scripts/cizy/probe-agents-md.ts): a 2-line AGENTS.md with a canary ('reason must begin with KUMQUAT-4417') was mounted via environment sources {type:inline, target:/.agents/AGENTS.md} on a setup interaction, and no turn input mentioned the canary. FOLLOWED in all three shapes: a fresh chain on the env (5.3 s), a continuation (4.9 s), and a second fresh chain on the same env, i.e. the first-turn-timeout restart path (5.9 s). The agent picked it up natively and never read the file with a tool. Limits: one run per shape, tiny file. DELIVERY PATH CHOSEN: mount only. Instructions are removed from the first-turn, catch-up and restart inputs, and the file persists in the environment.

**2026-11-21T17:08:02Z**

Merged into integration/wl-xgp7 (impl/wl-cizy d6fb4a8). codex review: no findings. Verification on integration: pnpm test 144/144, typecheck clean. AC evidence: test/system/agent-instructions.test.ts (each seat gets exactly its Ruleset-named sections in order, Villager shared,village / Seer +seer / Doctor +doctor / Werewolf shared,werewolf; no other role's section, marker or preamble; this also holds when an AgentConfig carries the whole sectioned file); test/architecture.test.ts now bans role names in src/do, core, harness and worker. A real local Match (wrangler dev, 2 Hydrogen Agents, mounted file as the only source) ended in a wolf win in 133 s with 0 timeouts; all 14 speeches were 3 sentences and 229-335 chars, accuse was filled in 7/14 and always matched the text, defend 0/14, claim 1. Observations: the village Abstained on D1 at 4v2 despite the instructions; /notes.md use couldn't be observed. Follow-ups: the spec line 'First turn: rules + Agent Instructions' and the wl-nos5 text are now stale (the orchestrator should update the spec); the PREAMBLE 'Act only by calling the game tools' may conflict with the /notes.md instruction.
