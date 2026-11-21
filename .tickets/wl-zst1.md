---
id: wl-zst1
status: open
deps: [wl-t4no, wl-cizy]
links: []
created: 2026-11-21T17:26:10Z
type: task
priority: 3
assignee: Ryan Swift
parent: wl-xgp7
tags: [stretch, ready-for-human]
---
# Pi Durable harness with Agent37 sandboxes and OpenRouter models (stretch)

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
**Stretch.** Start only after the rehearsal (wl-t4no) passes and the human retags this ready-for-agent. Hard stop at the 16:30 freeze.

A second Harness, harness: "pi", so the League can field non-Gemini models running on a different sandbox provider. New Agents appear on the leaderboard as model + Agent Instructions + pi harness (e.g. 'Claude Opus 5.5 · Pi').

**Pieces:**
- **Harness: Pi Durable via Cloudflare's PiHarness** (Agents SDK agents/harness/pi, packages @earendil-works/pi-durable and pi-ai). It's experimental, so pin versions. Each Player turn is one harness.prompt() carrying the observation.
  - **Game tools** are Pi ToolRegistrations with the seat's fixed tool list. execute() validates through the Ruleset. The first valid call records the action and ends the turn; an invalid call returns an error result naming the required action, so the model retries inside the same prompt; extra calls are ignored. Cap tool rounds with maxTurns.
  - **Agent Instructions:** the Ruleset-named sections (wl-cizy) become Pi's instructions/skill sections.
- **Hosting:** prefer installing PiHarness into the existing Player DO. If that doesn't work cleanly (Player DO is a plain DurableObject; PiHarness needs the Agents SDK Lifecycle), host it in a dedicated Agents-SDK DO per seat and have the pi Harness adapter drive it through startTurn/poll. The Harness interface and the League stay unchanged either way.
- **Sandbox: Agent37.** One instance per Player (isolation: copies share nothing), created at provisioning. Persist the instance ID before anything else, and delete it when the Match ends. A best-effort cleanup sweep runs on League pause.
  - Expose a bash tool (POST /v1/instances/{id}/exec) and a notes file via exec, matching the Managed Agents notes feature.
  - Use the network setting to disable egress if Agent37 supports it.
- **Models: OpenRouter.** Prefer pi-ai's OpenRouter support if it exists. Otherwise route through AI Gateway, which Cloudflare documents for pi-ai. OpenRouter isn't documented for PiHarness, so verify it in the checkpoint. Model id comes from the Agent config, so changing models is a config edit.
- **Secrets:** OPENROUTER_API_KEY and AGENT37_API_KEY as Wrangler secrets (and in .dev.vars locally). Never in wrangler.jsonc vars.

**Checkpoint, ~30 min in:** one real seat completes a game turn: PiHarness in a DO, an OpenRouter model, a valid speak call recorded, and an Agent37 exec round-trip. If that isn't working, stop, record what failed, and leave the Managed Agents roster untouched.

**Spend:** this does not use the Gemini credit. OpenRouter and Agent37 bill separately. Before starting, the human sets a credit limit on the OpenRouter key and a small Agent37 wallet top-up. Start with 1-2 pi Agents at low N.

**References:** https://developers.cloudflare.com/agents/harnesses/pi/ (plus extensions/ and models/pi-ai/); https://www.agent37.com/docs/llms.txt (instances/create, exec, templates).

## Acceptance Criteria

- [ ] Checkpoint result recorded in a note (works or stopped, and why) within ~30 min of starting
- [ ] Fake-backed tests: the pi Harness satisfies the Harness interface; first valid call wins, invalid calls get an error result, and extra calls are ignored
- [ ] A real local Match runs to a result with at least one pi Agent (OpenRouter model, Agent37 sandbox) alongside Managed Agents
- [ ] Agent37 instances are deleted when the Match ends; their IDs are persisted before use
- [ ] Secrets only in Wrangler secrets and .dev.vars; the repo contains no keys

