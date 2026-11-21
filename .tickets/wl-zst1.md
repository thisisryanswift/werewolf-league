---
id: wl-zst1
status: open
deps: [wl-t4no, wl-cizy, wl-2lfo]
links: []
created: 2026-11-21T17:26:10Z
type: task
priority: 1
assignee: Ryan Swift
parent: wl-xgp7
tags: [stretch, ready-for-human]
---
# Pi Durable harness with Agent37 sandboxes and OpenRouter models (stretch)

## Parent
Spec wl-xgp7 (Spec: Werewolf League on Durable Objects). Vocabulary: GLOSSARY.md. Architecture: docs/adr/0001, docs/adr/0002.

## What to build
**Stretch, priority right after the ramp test.** Start only after the rehearsal (wl-t4no) passes and the human retags this ready-for-agent. Hard stop at the 16:30 freeze.

**Revised 2026-11-21:** pi Agents play in their own League, pi-open (wl-2lfo). The comparison with Managed Agents uses absolute metrics in the League comparison view (wl-9u76), not Elo. Seat Hydrogen on Pi through OpenRouter as the controlled comparison ('Hydrogen · Pi' vs 'Hydrogen · Managed'). It bills the Google key stored on OpenRouter; verify the model is listed. Then add several non-Gemini OpenRouter models for breadth.

A second Harness, harness: "pi", so the League can field non-Gemini models running on a different sandbox provider. New Agents appear on the leaderboard as model + Agent Instructions + pi harness (e.g. 'Claude Opus 5.5 · Pi').

**Pieces:**
- **Harness: Pi Durable (Earendil) via Cloudflare's PiHarness** (Agents SDK agents/harness/pi; packages @earendil-works/pi-durable and pi-ai). It's experimental, so pin exact versions: the spike used agents 0.33.0 and Pi 1.5.2. Each Player turn is one prompt carrying the observation. Pass the model and maxTurns (>= 2, spike used 4) when the seat DO is constructed.
  - **Game tools** are Pi ToolRegistrations with the seat's fixed tool list, using the Ruleset's ToolSpec JSON Schema directly. execute() asks the Match whether the call is legal through a new validate-only Match RPC (backed by the Ruleset's validate). Harness code never names the Ruleset (the architecture test enforces this).
    - **Legal:** return control:{terminate:true}; the adapter's poll then returns the call, and the Match records it through the normal path, exactly once.
    - **Illegal:** return the error text with isError:true, so the model retries inside the same run.
    - **Extra calls** after the first legal one are ignored (keep a first-valid flag; terminate only ends the run if every parallel call sets it).
  - **Model errors** (run ends with model_error after Pi's ~15 s of retries) are reported as a poll error.
  - **Agent Instructions:** the Ruleset-named sections (wl-cizy) become Pi's instructions/skill sections.
- **Hosting (decided, ADR-0003):** a dedicated PiSeatDO per pi seat hosts Pi Durable. The existing PlayerDO drives it through the pi Harness adapter's startTurn/poll over RPC. PiSeatDO's RPC methods call lifecycle.start(). PiHarness can't live in PlayerDO, because Lifecycle wants the alarm PlayerDO uses for polling. The Harness interface, Match and League stay unchanged.
- **Sandbox: Agent37.** One instance per Player (isolation: copies share nothing), created at provisioning. Persist the instance ID before anything else, and delete it when the Match ends. A best-effort cleanup sweep runs on League pause.
  - Expose a bash tool (POST /v1/instances/{id}/exec) and a notes file via exec, matching the Managed Agents notes feature.
  - Create instances with egress deny-all (verified: it blocks DNS and outbound traffic, exec still works; an outbound attempt waits out its timeout). Template agent37-base. The main API uses Authorization: Bearer; the exec host uses X-Agent37-Key.
- **Build hygiene:** fix pnpm's build-script approvals for the new packages so pnpm install --frozen-lockfile passes before merging. Start from the spike branch prototype/pi-spike (commits 4016b4c, 9eefeb8) and its FINDINGS.md.
- **Models: OpenRouter, through pi-ai's native support** (verified; no AI Gateway). The model id comes from the Agent config, so changing models is a config edit. Use non-Gemini models (e.g. anthropic/claude-haiku-5.5, deepseek/deepseek-v4.1-flash): Gemini through OpenRouter bills the Google key stored on the OpenRouter account. Pi's model catalog is stale, so pick ids verified upstream on OpenRouter.
- **Secrets:** OPENROUTER_API_KEY and AGENT37_API_KEY as Wrangler secrets (and in .dev.vars locally). Never in wrangler.jsonc vars.

**Checkpoint: passed in the spike** (see the note). Remaining risk is integration: the validate-only RPC, the Agent37 bash/notes tool wired into Pi, and a full Match.

**Spend:** OpenRouter ($100 key cap) and Agent37 (capped auto-refill) bill separately from the Gemini credit. Before starting, the human sets a credit limit on the OpenRouter key and a small Agent37 wallet top-up. Start with 1-2 pi Agents at low N.

**References:** https://developers.cloudflare.com/agents/harnesses/pi/ (plus extensions/ and models/pi-ai/); https://www.agent37.com/docs/llms.txt (instances/create, exec, templates).

## Acceptance Criteria

- [ ] pnpm install --frozen-lockfile passes with the new packages
- [ ] Pi game tools validate through the Match's validate-only RPC; harness code never names the Ruleset (the architecture test passes)
- [ ] The Agent37 bash/notes tool works from a pi seat with egress deny-all
- [ ] Fake-backed tests: the pi Harness satisfies the Harness interface; first valid call wins, invalid calls get an error result, and extra calls are ignored
- [ ] A real local Match runs to a result with at least one pi Agent (OpenRouter model, Agent37 sandbox) alongside Managed Agents
- [ ] Agent37 instances are deleted when the Match ends; their IDs are persisted before use
- [ ] Secrets only in Wrangler secrets and .dev.vars; the repo contains no keys


## Notes

**2026-11-21T17:56:46Z**

Spike result (2026-11-21, prototype/pi-spike in ../werewolf-league-pi, commits 4016b4c and 9eefeb8, notes prototypes/pi-spike/FINDINGS.md): CHECKPOINT PASSED. One real seat completed a Day 1 Speech Round A turn: PiHarness in a DO; an OpenRouter model (deepseek/deepseek-v4.1-flash and anthropic/claude-haiku-5.5 both work through pi-ai's native OpenRouter support, no AI Gateway needed); a valid speak recorded through a Pi ToolRegistration checked by the real Ruleset; Agent37 create/exec/delete from the Worker (agent37-base, deny-all egress: create 0.57 s, exec 0.23-0.49 s, delete 0.27 s, nothing left running).
Turn latency: valid call recorded at 1.3 s (run done 1.5 s); a rejected first call followed by a retry took 2.0 s (DeepSeek) and 3.6 s (Haiku).
Findings:
(1) PiHarness can't share PlayerDO. Lifecycle skips handlers the class already defines and wants the single alarm, which PlayerDO uses for polling. A separate per-seat PiSeatDO driven over RPC via startTurn/poll works; its RPC methods must call lifecycle.start().
(2) A valid call returns control:{terminate:true}, which is undocumented. An invalid call returns isError:true and the model retries; keep maxTurns >= 2 (the spike used 4). terminate only ends the run if every parallel call sets it, so keep our first-valid flag, or use executionMode sequential.
(3) A session's model and maxTurns are fixed at DO construction; pass the model then, or call session.setModel.
(4) Model errors don't throw: after ~15 s of retries the run ends with model_error, which the adapter must report as a poll error.
(5) Pi's model catalog is stale (google/gemini-2.5-flash-lite returns 404 upstream).
(6) Versions: agents 0.33.0 and Pi 1.5.2, pinned. Newer releases are hidden by safe-chain's minimum-age check.
(7) pnpm install --frozen-lockfile now fails, because 3 new packages need build-script approval. Fix before merging.
(8) The architecture test bans harness code from naming the Ruleset, and the spike validated against a local state copy. Decision needed on validation ownership (resolved below).
(9) Gemini models via OpenRouter bill the Google key stored on the OpenRouter account.
Not yet done: an Agent37 bash/notes tool wired into Pi; extra calls after a valid one; Pi schema-failure calls; eviction mid-run. Spend: ~5 short OpenRouter turns.
