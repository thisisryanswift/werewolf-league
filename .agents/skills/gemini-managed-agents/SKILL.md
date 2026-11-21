---
name: gemini-managed-agents
description: Use this skill when writing, debugging, or reviewing code that runs Gemini managed agents (the Antigravity agent) through the Interactions API, i.e. code with `agent="antigravity-..."`, `client.interactions` calls that pass `agent=` or `environment=`, `client.agents`, or that mentions Gemini managed agents or the Antigravity agent. Carries empirically verified request shapes, gotchas, latency, and cost. For general Gemini API usage use the `gemini-api-dev` skill; for `gemini-decision-1` see the Decisions API docs.
---

# Gemini Managed Agents (Antigravity agent)

> [!WARNING]
> **Public Preview (`v1beta`).** Managed agents and the agent surface of the Interactions API change without notice: several behaviours below changed *during* our test week. Every empirical fact here was **verified 2026-11-18 to 2026-11-20 with `antigravity-preview-09-2026`, `google-genai` 3.3.0**. When the live API or docs disagree with this skill, re-check the docs index at https://aistudio.google.com/llms.txt (append `.md` to any doc URL for raw markdown) and trust a fresh observation over this file.
>
> **The hosted docs have known errors and gaps** (as of 2026-11-20):
> 1. The Antigravity guide's function-calling example omits `tools` on the continuation and fails with a 400 in every language tab.
> 2. The background/streaming guides promise an `event_id` on every stream event for `last_event_id` resume. Agent streams carry none.
> 3. The webhooks guide says dynamic webhooks are signed as RS256 JWTs looked up by `kid`. Real deliveries are Standard Webhooks `v1a` (Ed25519) and the JWKS keys have no `kid`.
> 4. *(Gap)* The webhooks guide implies agent support, but agents got no webhooks at all (see Gotchas).
> 5. The webhook event catalog lists `interaction.cancelled`, but subscriptions reject it.
> 6. *(Gaps)* `tools: []` reads as "no tools" but means default tools. "May slightly exceed" undersells the `max_total_tokens` overshoot.

Docs to fetch before writing code: [Antigravity agent](https://aistudio.google.com/docs/antigravity-agent.md), [Background execution](https://aistudio.google.com/docs/background-execution.md), [Streaming](https://aistudio.google.com/docs/streaming.md), [Agent environments](https://aistudio.google.com/docs/agent-environment.md), [Custom agents](https://aistudio.google.com/docs/custom-agents.md), [Agent hooks](https://aistudio.google.com/docs/agent-hooks.md), [Webhooks](https://aistudio.google.com/docs/webhooks.md). For calibrated yes/no, choice, or score judgments (`gemini-decision-1`), use the [Decisions API](https://aistudio.google.com/docs/decisions-api.md) instead of an agent.

References in this skill:
- [references/rest-and-streaming.md](references/rest-and-streaming.md): raw REST/`fetch` shapes (Workers/Durable Objects), the reconnecting stream consumer, environment config objects, webhook signature details.
- [references/performance.md](references/performance.md): full latency, token, concurrency, and price tables.

## Request shapes (Python)

```python
from google import genai
client = genai.Client(http_options={"api_version": "v1beta", "timeout": 600_000})  # sync agent calls block until done
AGENT = "antigravity-preview-09-2026"
CFG = {"type": "antigravity", "model": "gemini-4-hydrogen", "max_total_tokens": 100_000}
TOOLS = [VOTE_FN]   # define ONCE; resend this exact list on every continuation
```

**First turn** (background; `environment` is required):

```python
it = client.interactions.create(
    agent=AGENT, agent_config=CFG, tools=TOOLS,
    environment="remote",          # fresh sandbox; or an existing environment_id; or a config object
    background=True, store=True,   # store=True is the default; background requires it
    input="You are P4 ... Vote now.",
)
persist(it.id, it.environment_id)  # FIRST, before anything else: there is no list endpoint
```

**Function-call continuation.** Pick the pending call by unmatched `call_id` (filesystem tools also appear as `function_call` steps, already answered). Resend the identical `tools`. Put new information inside the `function_result`:

```python
answered = {s.call_id for s in it.steps if s.type == "function_result"}
fc = next(s for s in it.steps if s.type == "function_call" and s.id not in answered)
it2 = client.interactions.create(
    agent=AGENT, agent_config=CFG,
    tools=TOOLS,                               # identical list, or 400
    previous_interaction_id=it.id,
    environment=it.environment_id,
    background=True,
    input=[{"type": "function_result", "name": fc.name,
            "call_id": fc.id,                  # = the function_call step's `id`
            "result": {"recorded": True, "new_events": delta_text, "instruction": "Vote again."}}],
)
persist(it2.id)                                # every continuation has a NEW interaction ID; poll that one
```

Echoing the call's `signature` back is not needed. Sending new text as a separate step also works, but costs a second model pass. Do it only when it must be a user message. A bare `{"type": "text"}` next to a `function_result` fails client-side validation, so wrap it as a `user_input` step:

```python
input=[{"type": "function_result", "name": fc.name, "call_id": fc.id, "result": {"recorded": True}},
       {"type": "user_input", "content": [{"type": "text", "text": delta_text}]}]
```

**Environment reuse (memory).** Pass a previous `environment_id` to keep files and the self-edited `/.agents/AGENTS.md`. Leave out `previous_interaction_id` to start a fresh conversation chain in the same sandbox. That is the only way to reset accumulated context.

```python
client.interactions.create(agent=AGENT, agent_config=CFG, tools=TOOLS, environment=saved_env_id, input="...")
```

**Saved agent forked from an environment** (returns in ~0.2 s; the fork is lazy, per run):

```python
client.agents.create(id="wolf-v2", base_agent=AGENT, base_environment=saved_env_id,
                     agent_config={"type": "antigravity", "model": "gemini-4-neon"})
run = client.interactions.create(agent="wolf-v2", environment="remote", tools=TOOLS, input="...")
client.agents.delete(id="wolf-v2")
```

Every invocation gets a **new** `environment_id` holding a clean copy of the base. Writes in one run are not visible to the next, and the base is never modified. To carry learning forward, reuse that run's `environment_id` or fork again from it. Saved agents lock their model at creation, and `id` may not start with `google-` or `gemini-`. The documented `system_instruction` and `base_environment={"type": "remote", "sources": [...]}` fields were not tested by us.

**Background + polling with watchdog and cancel:**

```python
deadline = time.monotonic() + ACTION_DEADLINE_S
while (it := client.interactions.get(id=iid)).status in ("in_progress", "queued"):
    if time.monotonic() > deadline:
        client.interactions.cancel(id=iid)     # then apply the default action
        break
    time.sleep(2)
# terminal: requires_action | completed | incomplete | failed | cancelled
```

Cancelling a continuation does **not** consume the pending function call, so you can retry the continuation from the same parent.

**`agent_config`** accepts exactly `type` (`"antigravity"`), `model`, and `max_total_tokens`. Anything else returns 400. `max_total_tokens` comes back as a string (`"20000"`).

## Gotchas

**Tools**
- Resend the **identical** `tools` list on every continuation. Omitting it or sending a subset fails fast in sync and background mode: `400 invalid_request: tools must match the interaction referenced by previous_interaction_id.` (Before 2026-11-20 the error was `received tool response but no client tool call is pending`, and background continuations sat in `in_progress` with zero steps until cancelled (observed for 150 s and >5 min). Keep a watchdog in case that regresses.)
- `tools: []` and omitting `tools` both mean **default tools** (code execution, Google Search, URL context). To restrict, pass an explicit non-empty list. `tools=[your_fn]` removes code execution, search, and fetching.
- Filesystem tools (`write_to_file`, `list_dir`, ...) **cannot be disabled**. They come with the sandbox and run automatically.
- `environment` is required: `Missing required field 'environment'`.

**Notifications: stream or poll, no webhooks**
- Agents get no webhooks. A dynamic `webhook_config` with `agent=` returns `400 invalid_request: Request contains an invalid argument.` Static project webhooks never fired for agent interactions (0 of 10 deliveries; a plain-model control was delivered).
- Streams (`client.interactions.get(id=..., stream=True)`) carry **no `event_id`** and no SSE `id:`. Every reconnect replays from `interaction.created`, so dedupe by step `index`.
- **One live stream per interaction.** A second concurrent stream gets `400 invalid_request: Precondition check failed.` After a disconnect, the slot stays locked for about 2–5 s. Retry with about 2 s backoff for about 10 s.
- The terminal stream event is **always `interaction.completed`**, even for `requires_action`, so read `event.interaction.status`.
- Gemini closes every stream connection at **~600 s** with a clean EOF. EOF without `interaction.completed` means reconnect, not done.
- Polling shows `steps: []` for the whole of `in_progress`. All steps appear at once at the end, so stream if you need live progress.

**Replying early**
- The `function_call` is fully streamed about 1–1.5 s before the terminal event. Replying in that window returns `400 invalid_request: Precondition check failed.` Wait for the terminal event, or retry on that error.

**Thinking**
- Agents have no thinking controls. `agent_config.thinking_level`, `thinking_config`, and `thinking_summaries` return `400 Unknown parameter '<name>' at 'agent_config'.` Top-level `generation_config` returns `400 Cannot supply both 'generation_config' and 'agent'.`
- Readable `thought.summary` text is rare and can't be requested (one of three audit runs had it). Display it when present. Don't build a UI that depends on it; surface tool calls or a `reason` argument instead.
- A big first turn is slow because of thinking, not reading (Hydrogen spends 8–17k thought tokens on a 25k-token transcript).

**Token budget**
- `max_total_tokens` is best-effort and excludes cached tokens. When reached, the status becomes `incomplete`. At low caps it overshoots badly: a 500 cap ended after 7,644 tokens. Use at least ~10k (the agent's fixed scaffold is about 5k per turn), and size it at about 3× your visible context, because the agent loop re-reads context several times per turn.

**Interaction IDs and lifetime**
- No list endpoint: `GET /v1beta/interactions` returns 404. A lost ID means a run you can't find or cancel, so persist IDs before doing anything else. (Environments *can* be listed: `client.environments.list()`.)
- `requires_action` survived ~46 h in our recheck, so a parked turn can be resumed much later.

**Context growth**
- Earlier turns' thought tokens are carried forward and re-billed as input on every later turn (mostly cached). Trimming what you send doesn't remove them; only a new chain does.
- A separate `user_input` step next to a `function_result` doubles model passes. On Hydrogen the `function_result` shape was ~35% cheaper per turn ($0.021 vs $0.033) and grew context half as fast.

**Environments**
- The working directory is `/` (files land at `/note.txt`, `/.agents/AGENTS.md`).
- Edits to `/.agents/AGENTS.md` apply from the **next** interaction, never within the one that wrote them. Make "rewrite your playbook" a between-runs step.
- Environments stop after 15 min idle and are retained for 7 days. A cold resume adds about 1.5–5 s at p50.
- Egress goes only through an HTTP(S) proxy: no DNS, no raw sockets, raw-IP HTTPS refused. `network: "disabled"` and domain allowlists are enforced. Tools in the sandbox must honour `HTTPS_PROXY`.
- Environments are isolated from each other. The sandbox's `GEMINI_API_KEY` is a non-working placeholder.
- Function-only agents never randomise; they always pick the majority option. Supply random numbers from your server, or give the agent code execution.

**Input limits**
- Antigravity accepts only `text` and `image` (inline base64 `data` + `mime_type`) input. Send PDFs and audio to plain model calls or the Decisions API.

**Hooks**
- Pre/post-tool hooks cover only code execution and filesystem tools, not your custom functions. They **fail open**: errors, timeouts (30 s default), and malformed output let the tool run. Never rely on a hook for integrity; route privileged actions through your own functions.

**Webhook signatures** (plain-model interactions only, since agents get none)
- Dynamic deliveries are Standard Webhooks `v1a`: Ed25519 over `"{webhook-id}.{webhook-timestamp}.{raw body}"`. Try every key in the JWKS (no `kid`). Static deliveries are `v1` HMAC-SHA256. Details are in [references/rest-and-streaming.md](references/rest-and-streaming.md).

**Cloudflare clients**
- When a script (e.g. Python `urllib`) calls a Cloudflare-fronted Worker, Cloudflare's edge rejects the default Python User-Agent with `403 error code: 1010`. Send an explicit `User-Agent`. This is a Cloudflare rule, not a Gemini error.

## Models and performance

*Measured, indicative; may change.* The seven accepted `agent_config.model` values: `gemini-4-hydrogen` (default), `gemini-4-neon`, `gemini-4-carbon`, `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`.

Game-sized context (7-turn chain, ~1.5k new tokens per turn inside the `function_result`):

| model | first turn | continuation p50 / p90 | $ / turn |
|---|---|---|---|
| `gemini-3.5-flash-lite` | ~10 s | 4 / 5 s | $0.003 |
| `gemini-4-hydrogen` | ~22 s | 13 / 17 s | $0.021 |
| `gemini-4-neon` | 70–87 s | 39 / 50 s | $0.098 |
| `gemini-4-carbon` | **~11 min** | 189 / 225 s | $0.29 |

- **~5k-token fixed scaffold per turn**, even for a trivial task. Sandbox code execution adds about 6k more.
- **Fat tail:** about 1 in 7 turns takes ~40 s regardless of model or load. Give every action a deadline with a default action (about 45 s for Flash-Lite and Hydrogen, 90 s for Neon). Carbon is unsuitable for interactive turn-taking.
- **Concurrency:** 100 concurrent agents on *existing* environments ran with 0 errors or 429s (`create()` p50 2.4 s). Bursts that create fresh sandboxes pay 9–15 s of `create()` admission latency, so provision environments ahead of time. Above 100 is untested.
- **Prices change:** Carbon and Argon double on 2026-12-01, and 3.6/3.8 Flash on 2027-01-01. Sandbox compute is free during preview. See [references/performance.md](references/performance.md).

## Orchestrator patterns that worked

1. **Persist IDs before anything else.** Write `interaction.id` and `environment_id` to durable storage immediately after `create()` returns. On shutdown or crash recovery, sweep the non-terminal IDs and cancel them.
2. **One owner per interaction stream** (for example, the Durable Object that owns the table). Fan events out to UIs from that owner, never from a second streamer. Reconnect on EOF or error with backoff, and dedupe the replay by step `index`.
3. **Poll as a watchdog.** A slow poll (every ~5 s, e.g. a DO alarm) doesn't take the stream slot. Cancel on deadline, then apply the default action.
4. **Provision environments up front,** one per agent, at setup time. In-game turns are then continuations on existing environments and skip the admission latency.
5. **Feed only deltas inside the `function_result`.** Don't resend transcripts: a 25k-token first turn takes 45–80 s on Hydrogen.
6. **Normalize model outputs that should obey constraints.** Flash models' werewolf probabilities summed to 3.3–4.2 instead of 2, so rescale server-side before scoring. Hydrogen and Neon respected the constraint.
7. **Resend the same `TOOLS` constant on every turn,** and select the pending call by unmatched `call_id`, not by position.
