# M1 sanity check results (wl-ewd7), 2026-11-21

Setup: `antigravity-preview-09-2026`, plain-fetch REST, `background: true`, `store: true`, `max_total_tokens` 100k,
the Seer's fixed tools `[speak, vote, inspect]` resent on every continuation, and each new observation inside the
previous action's `function_result`. Seat P3 (Seer) at an 8-seat table. Turns: N1 inspect, D1 speak, D1 vote,
N2 inspect, D2 speak, D2 vote. Each Day observation holds about 26 lines of synthetic discussion. We polled every
0.5 s. Latency runs from the start of `create()` until a terminal status is seen. Two chains per model ran, with at
most two runs in flight at once. Raw data is in the `*.json` files here.

## Per-turn latency (s) and tokens

| turn | expect | Hydrogen r1 s | r2 s | 3.8 Flash r1 s | r2 s | Hydrogen in / cached / thought / out (r1) | 3.8 Flash in / cached / thought / out (r1) |
|---|---|---|---|---|---|---|---|
| 0 (first) | inspect | 10.4 | 5.8 | 7.0 | 7.6 | 5756 / 0 / 156 / 21 | 4967 / 0 / 177 / 15 |
| 1 | speak | 6.6 | 14.5 | 11.6 | 14.3 | 6979 / 3702 / 297 / 89 | 6176 / 3753 / 822 / 90 |
| 2 | vote | 7.2 | 6.9 | 10.6 | 11.4 | 8376 / 5501 / 251 / 88 | 8058 / 5551 / 906 / 87 |
| 3 | inspect | 10.6 | 6.1 | 5.9 | 6.8 | 8782 / 6327 / 268 / 21 | 9079 / 7971 / 260 / 15 |
| 4 | speak | 8.6 | 6.1 | 5.4 | 13.0 | 10107 / 7366 / 277 / 144 | 10359 / 8982 / 172 / 119 |
| 5 | vote | 5.5 | 10.6 | 6.8 | 7.1 | 11535 / 9072 / 144 / 86 | 11604 / 10329 / 348 / 77 |

- Every turn on both models ended in `requires_action` with the expected tool. That is 24 out of 24 valid calls.
  Every vote's beliefs summed to 2.0, on both models.
- Continuations (10 per model): Hydrogen had a median of 7.1 s, a mean of 8.3 s and a range of 5.5–14.5 s. 3.8 Flash
  had a median of 8.9 s, a mean of 9.3 s and a range of 5.4–14.3 s. Flash's slower turns were speak/vote turns where
  it thought for 0.8–1.0k tokens.
- First turns: `create()` returned in 2.2–5.1 s on a fresh `"remote"` environment, against about 1 s for
  continuations and for an existing environment.
- Input grows by about 1.2–1.5k tokens per turn. Turn 5 is about 11.5–12.9k input, mostly cached, well under 100k.

**3.8 Flash: keep.** Its continuation median is about 1.25× Hydrogen's and both models have the same tail, so it is
not much slower.

## Recovery paths (Hydrogen)

1. **Cancel a continuation, then answer the original pending call later: confirmed.** The continuation was
   `in_progress` when cancelled. The cancel response and a `get` 2 s later both showed `cancelled`, with steps
   `[function_result]`. The parent stayed `requires_action`. Ten seconds later, a new continuation from the same
   parent with the same `call_id` and newer observations returned `requires_action` with a valid `speak`. One
   further turn on top of it gave a valid `vote`. The retry's input was 7,005 tokens, about the same as an
   uncancelled turn 1 (6,925–6,979), so the cancelled observation did not leak into context.
2. **Cancel a first turn (no parent), then start a fresh chain on the same environment: confirmed**, both ways:
   - Fresh `"remote"`: the `create()` response, while still `in_progress`, already carried `environment_id`. After
     the cancel the status was `cancelled` with zero steps, and the environment ID was unchanged. A fresh chain on
     that ID (no `previous_interaction_id`) returned `requires_action` with `inspect`, on the same environment, and
     the next continuation worked.
   - Existing (provisioned) environment: same result, with `create()` taking 1.0 s.
