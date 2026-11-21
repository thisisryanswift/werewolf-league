# PROTOTYPE findings: wl-zst1 Pi spike (2026-11-21)

Throwaway spike on branch `prototype/pi-spike`. Code: `prototypes/pi-spike/` (`spike.ts`, `wrangler.jsonc`). I ran it under local `wrangler dev` only and never deployed it.

It lives outside `src/harness/` because `test/architecture.test.ts` bans harness code from naming the Werewolf Ruleset. The real adapter has to reach the Ruleset through the interface too.

Run it with `pnpm exec wrangler dev -c prototypes/pi-spike/wrangler.jsonc --port 8799 --persist-to .wrangler/pi-spike-state`. It needs a gitignored `prototypes/pi-spike/.dev.vars` symlink to `../../.dev.vars`: Wrangler reads `.dev.vars` from the config's directory, and `--env-file` did not bind it.

**Checkpoint: it works.** PiHarness ran in a Durable Object with an OpenRouter model, recorded a valid `speak` through a Pi ToolRegistration validated by the real Werewolf Ruleset, and completed an Agent37 exec round-trip. Each piece ran separately. The bash tool is not yet wired into Pi.

## Versions (pinned exact)

- `agents@0.33.0`, plus these at 1.5.2: `@earendil-works/pi-durable`, `pi-ai`, `pi-schema` and `chord`.
- The Cloudflare docs describe agents ≥0.34 with Pi ~1.6. Safe-chain's minimum-age check hides those releases, so I used the newest matched set it allows (0.33.0 peers on Pi `~1.5.0`). The 1.5.2 types matched the docs for every API used here.
- Gotcha: `pnpm install --frozen-lockfile` now fails on "Ignored build scripts" (@google/genai, core-js-pure, protobufjs). The lockfile itself is consistent; this is the pnpm build-approval gate.

## 1. Hosting

- **Into the existing PlayerDO: no, not cleanly.** I read this from the code and did not run it. Per the docs, PiHarness needs only a plain `DurableObject` plus `Lifecycle.install(this).use(harness)`, with no Agent class.
  - `Lifecycle.installHandlers()` skips any handler the host already defines (`if (name in host) continue`). PlayerDO defines `alarm()`, so Lifecycle's alarm is never installed. That alarm is what wakes pi after an eviction or a retry backoff.
  - Lifecycle also owns the DO's single physical alarm (`rearmAlarm` recomputes it from its job queue). PlayerDO's `setAlarm` poll loop and Lifecycle would overwrite each other.
  - Folding pi into PlayerDO would mean moving PlayerDO's polling onto Lifecycle jobs or `onAlarm()`. That is a refactor of a working DO on deadline day.
- **Separate per-seat DO: yes, run.** `PiSeatDO` (plain DurableObject + Lifecycle + PiHarness) is driven over RPC as `startTurn` → `harness.submit()` and `poll` → recorded call plus `harness.pending()`. That is exactly the Harness `startTurn`/`poll` shape, so the Harness interface and the League stay unchanged.
- RPC methods must call `await this.lifecycle.start()`, because native RPC bypasses the automatic start.

## 2. OpenRouter

**Native pi-ai support works; no AI Gateway needed.** Use `openrouterProvider()` from `@earendil-works/pi-ai/providers/openrouter` on `createModels()`, with the model ref `{ provider: "openrouter", id }`.

- **Key injection:** `createModels({ authContext: { env: async (n) => this.env[n], fileExists: async () => false } })`. It reads `OPENROUTER_API_KEY` from Worker env (.dev.vars locally, a Wrangler secret when deployed) and does not touch `process.env`.
- **Both OpenRouter wires work:**
  - `deepseek/deepseek-v4.1-flash` (`openai-completions`): cheap, called the tool correctly first time.
  - `anthropic/claude-haiku-5.5` (`anthropic-messages`): the rejected-first turn was recorded after 3.3 s and settled at 3.6 s.
- **Gotcha: Pi's catalog is stale.** `google/gemini-2.5-flash-lite` is in pi-ai's OpenRouter catalog but returns 404 upstream ("no longer available to new users"). The account also has a Google BYOK key on OpenRouter (`is_byok: true`), so Gemini models bill against that key. Pick models that exist on OpenRouter today.
- **Gotcha: a model error is not raised as an exception.** The run settles `unanswered` with reason `model_error`, after Pi's own retries (about 15 s). The adapter should map that to `poll → error`.
- **Gotcha: a session's model and `maxTurns` are fixed when the session is first created.** My first attempt read the model from storage in the constructor before `setup()` wrote it, so the session got the default. The adapter must know the model when the DO is constructed (for example from the DO name or seating), or call `session.setModel`.
- **Spend:** about 5 short turns. The key has a $100 limit.

## 3. Game turn (seat 1, Day 1 Speech Round A, 7-player real Ruleset state)

**Open design point:** the spike validated against a Ruleset state snapshot stored in `PiSeatDO`. In the real system the state lives in the Match, and the only Match RPC is `submitAction(turnId, seat, call)`, which validates and records in one step. There is no validate-only RPC.

The real `execute()` should therefore call `submitAction` itself (through PlayerDO or directly). It then returns `terminate` on accepted and `isError` with the Match's error on invalid, and `poll` reports `done` without a second submit. Alternatively, the Match hands a frozen state or validator to the seat with each turn. Either way, decide who records the action so it is never submitted twice.

| Case | Recorded call | Run settled | Model requests |
| --- | --- | --- | --- |
| Valid call | 1.3 s after submit | 1.5 s, `done` | 1 |
| First call rejected (DeepSeek) | 1.7 s after submit | 2.0 s, `done` | 2 |
| First call rejected (Claude Haiku 5.5) | 3.3 s after submit | 3.6 s, `done` | 2 |

- **Setup:** the observation comes from `renderObservation` and the instructions from `briefing`, delivered as a Pi section (`agent_instructions`). The tools are the seat's real `ToolSpec[]` (`speak`, `vote`, `inspect`, since seat 1 is the Seer). `ToolSpec.parameters` (JSON Schema) passes straight into `ToolRegistration.parameters`, with no pi-schema conversion.
- **Valid call:** `execute()` validates with `werewolf.validate`, records the call, and returns `control: { terminate: true }`. That ends the run without another model request, which answers the docs gap of how a tool ends the turn.
- **Rule-invalid call:** the first call was rejected on purpose. Returning `{ output: [text of the error], isError: true }` sends it to the model, which retried inside the same run and was accepted.
  - So the Match-level retry (`submitAction` → invalid → new `startTurn`) is mostly unnecessary for pi, but harmless as a fallback.
- **`maxTurns: 4`:** enough for retries. Don't use 1, because it kills the in-run retry.
- **Not observed:**
  - Extra calls after a valid one: the model never made any. The code returns "ignored", and `terminate` ends the round.
  - A schema-invalid call: Pi validates args against `parameters` before `execute`. I did not force one.
  - Eviction mid-run: the run finished before the DO could idle, so recovery via Lifecycle's alarm is untested.
- **Gotcha: parallel calls in one round.** `terminate` ends the run only when every result in the round sets it. If the model issues `speak` and something else in one round, "first valid wins" is enforced by the recorded flag, not by Pi. Set `executionMode: "sequential"` on the game tools if call order matters.

## 4. Agent37

Template `agent37-base`, 2 vCPU / 4 GB / 2 GB disk, type `default`, `network: "deny-all"`.

| Step | Latency | Result |
| --- | --- | --- |
| Create | 0.57 s | 201, already `running` |
| Exec, first | 0.49 s | `exit_code: 0`, stdout echoed; a notes file write/read via exec works |
| Exec, second | 0.23 s | `exit_code: 0` |
| Delete | 0.27 s | `{ deleted: true }` |
| List afterwards | | No `wl-pi-spike*` instances left |

- **Egress:** `deny-all` blocks DNS (`curl: Resolving timed out`), and exec still works.
  - Gotcha: an egress probe burns its full timeout (15 s here), so keep sandbox commands short or set timeouts.
- **Gotcha: two auth schemes.**
  - `api.agent37.com/v1`: `Authorization: Bearer` for create, list and delete.
  - `sandbox.agent37.app/v1/instances/{id}/exec`: `X-Agent37-Key`. Pre-instance errors there are flat `{ "error": "not_found" }`.
- **Cost:** about $4.76 a month per running instance, metered per minute. Delete at Match end matters, and pause/stop bills disk only.
- **Not done:** wiring the bash tool into Pi as a ToolRegistration that calls exec. It is the same pattern as `speak`, so the risk is low.

## Verification

- `pnpm typecheck` passes.
- `pnpm test` passes (173 tests) after moving the spike out of `src/harness/`.

## Recommendation for the real ticket

1. Add `harness: "pi"` as an adapter that drives a dedicated `PiSeatDO` (one per Player) over RPC. Keep PlayerDO and the Harness interface unchanged.
2. Inside `PiSeatDO`:
   - Ruleset-validated ToolRegistrations: `terminate` on a valid call, `isError` on an invalid one.
   - A bash tool and a notes tool that call Agent37 exec.
   - Create the Agent37 instance at `provision`, persist its ID first, and delete it at Match end.
3. Choose OpenRouter models that exist upstream today.
