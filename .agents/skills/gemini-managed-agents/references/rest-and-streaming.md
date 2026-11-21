# REST shapes, stream consumer, environments, webhook signatures

Verified 2026-11-18 to 2026-11-20 with `antigravity-preview-09-2026` on `v1beta`. Preview: re-check https://aistudio.google.com/llms.txt when anything disagrees.

## REST (works from a Worker / Durable Object with plain `fetch`)

Base: `https://generativelanguage.googleapis.com/v1beta/interactions`. Auth header: `x-goog-api-key`. JSON fields are snake_case.

| Operation | Request |
|---|---|
| Create / continue | `POST /v1beta/interactions` with JSON body |
| Get (poll) | `GET /v1beta/interactions/{id}` |
| Stream (SSE) | `GET /v1beta/interactions/{id}?stream=true` |
| Cancel | `POST /v1beta/interactions/{id}/cancel` with body `{}` |
| Delete | `DELETE /v1beta/interactions/{id}` |
| List | **none** (`GET /v1beta/interactions` returns 404) |

First turn body:

```json
{
  "agent": "antigravity-preview-09-2026",
  "agent_config": {"type": "antigravity", "model": "gemini-4-hydrogen", "max_total_tokens": 100000},
  "tools": [{"type": "function", "name": "vote", "description": "...", "parameters": {"type": "object", "properties": {}}}],
  "environment": "remote",
  "background": true,
  "store": true,
  "input": "You are P4 ..."
}
```

Continuation body: same `agent`, `agent_config` and **identical `tools`**, plus:

```json
{
  "previous_interaction_id": "<paused interaction id>",
  "environment": "<paused interaction's environment_id>",
  "input": [{"type": "function_result", "name": "vote", "call_id": "<function_call step id>",
             "result": {"recorded": true, "new_events": "..."}}]
}
```

A paused `function_call` step looks like `{"type":"function_call","id":"call_<digits>","name":"vote","arguments":{...},"signature":"<opaque>"}`.

The JS SDK (`@google/genai`, `new GoogleGenAI({ apiVersion: "v1beta" })`) exposes `client.interactions.create/get/cancel` and `client.agents.*`. We only exercised the raw REST path from Workers, so treat SDK field casing as docs-derived.

## Reconnecting stream consumer (Durable Object, JS)

A sketch of what held up in production on workers.dev. A DO held 1–2 min streams to the end inside `ctx.waitUntil`. Gemini cut longer ones at ~600 s.

```js
const API = "https://generativelanguage.googleapis.com/v1beta/interactions";

async function followInteraction(id, env, onEvent) {
  const doneSteps = new Set();                  // step indexes already emitted (step.stop seen)
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await fetch(`${API}/${id}?stream=true`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
    if (res.status === 400) {                   // "Precondition check failed": slot busy or still locked
      await res.text(); await sleep(2000); continue;
    }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    let terminalStatus = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;                          // EOF: completion only if we saw interaction.completed
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, k); buf = buf.slice(k + 2);
        const ev = (frame.match(/^event: *(.*)$/m) || [])[1];
        const data = (frame.match(/^data: *(.*)$/m) || [])[1] || "";
        if (!ev || data === "[DONE]") continue;
        const d = JSON.parse(data);
        if (ev === "interaction.completed") terminalStatus = d.interaction?.status; // requires_action | completed | ...
        if (ev.startsWith("step.") && doneSteps.has(d.index)) continue;   // replayed, already handled
        if (ev === "step.stop") doneSteps.add(d.index);
        await onEvent(ev, d);   // onEvent must reset its buffer for d.index on step.start (partial step replays)
      }
    }
    if (terminalStatus) return terminalStatus;
    await sleep(2000);                          // ~600 s cut or network drop: reconnect, expect full replay
  }
  throw new Error("stream did not reach interaction.completed");
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
```

Notes:
- Raw SSE frames have only `event:` and `data:` lines. The stream ends with `event: done` / `data: [DONE]`.
- The turn sequence on a function pause is `interaction.created`, then `interaction.status_update(in_progress)`, then `step.start{function_call}`, then `step.delta{arguments_delta}`, then `step.stop`, then `interaction.completed{status: requires_action, usage}`.
- Dedupe by step `index`: replay re-sends every step from the start. Skip steps whose `step.stop` you already saw, and restart the buffer of the in-flight step on its replayed `step.start`. `interaction.created` and `status_update` also repeat, so make their handlers idempotent. Every step event (`step.start`, `step.delta`, `step.stop`) carries the step's `index`.
- Keep a slow alarm poll (`GET /{id}` every ~5 s) alongside. It doesn't take the stream slot and catches a stuck stream.

Python SDK equivalent (event attributes as used in our probes):

```python
for e in client.interactions.get(id=iid, stream=True):
    if e.event_type == "step.start":
        step_type = e.step.type
    elif e.event_type == "interaction.completed":
        status = e.interaction.status        # read status; the event type is always "completed"
```

## Environment config object

```python
environment = {"type": "remote", "network": "disabled"}
environment = {"type": "remote", "network": {"allowlist": [{"domain": "example.com"}]}}
```

Both were verified to enforce at the proxy: `disabled` returns 403 for everything, and the allowlist returns 403 for other domains. The docs also describe `sources` (repository, Cloud Storage, inline files), per-domain header `transform`/`credential`, and environment variables. We didn't test those. List environments with `client.environments.list(page_size=...)` and delete them with `client.environments.delete(id=...)`.

## Webhook signatures (plain `model=` interactions; agents get no deliveries)

- **Dynamic** (`webhook_config` on the request): headers `Webhook-Id: msg_<uuid>`, `Webhook-Timestamp: <unix s>`, `Webhook-Signature: v1a,<base64>`. Verify Ed25519 over `f"{webhook_id}.{timestamp}.{raw_body}"` against each key in `https://generativelanguage.googleapis.com/.well-known/jwks.json`. The keys are OKP/Ed25519 and none has a `kid`, so try them all. The docs' RS256/JWT code cannot verify these.
- **Static** (project subscription): Standard Webhooks `v1`, HMAC-SHA256 with key = base64-decode of the part after `whsec_`, over the same `"{id}.{timestamp}.{body}"` string.
- Envelope is thin: `{"id":"evt_...","type":"interaction.completed","data":{"id":"<interaction id>"},"created_at":0,"user_metadata":{...}}`. `created_at` was literally 0, so fetch the interaction for details.
- Accepted `subscribed_events`: `batch.succeeded`, `batch.expired`, `batch.failed`, `interaction.requires_action`, `interaction.completed`, `interaction.failed`, `video.generated`. `interaction.cancelled` is rejected despite being in the catalog.
