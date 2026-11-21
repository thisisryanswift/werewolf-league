# Performance, tokens, concurrency, prices

**Measured, indicative; may change.** Verified 2026-11-18 to 2026-11-20 with `antigravity-preview-09-2026` and `google-genai` 3.3.0, from one project. Small samples (n=2–15 per row unless noted). Preview service: re-measure before relying on any number.

## Game-sized chain (agent, new info inside `function_result`)

The chain has 7 turns. Turn 0 is ~1.5k tokens of discussion, and each later turn returns the vote result plus ~1.5k new tokens. There is one custom `vote` function and no code execution. `max_total_tokens` is 150k.

| model | turn 0 | continuation p50 / p90 / max | $/turn (mean) | thought tokens/turn p50 | input at last turn |
|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` | 10 s | 4 / 5 / 5 s | $0.0032 | 366 | 15.9k |
| `gemini-4-hydrogen` | 22 s | 13 / 17 / 20 s | $0.021 | 1,736 | 23.9k |
| `gemini-4-neon` | 70–87 s | 39 / 50 / 56 s | $0.098 | 4,558 | 43–46k |
| `gemini-4-carbon` | 642–650 s | 189 / 225 / 226 s | $0.29 | 16,502 | 85–94k by turn 3 |

- Carbon spent 49–59k thought tokens on a 1.5k-token first prompt. Its context grows fast because the thoughts carry forward.
- The same chain with a separate `user_input` step: Hydrogen $0.033 and 18.5 s per turn, with 50.7k input by turn 6, versus $0.021, 15.4 s, and 23.9k for the delta-in-`function_result` shape.
- A cold first turn on a ~25k-token transcript took 43–81 s on Hydrogen, 44–51 s on 3.6 Flash, and 13–19 s on Flash-Lite.

## Small function round-trip (all seven models accepted)

The task is a trivial function call, then a reply (n=3 each). Token counts are dominated by the ~4.5–4.9k agent scaffold.

| model | turn 1 → pause p50 | continuation p50 | tokens per round-trip |
|---|---|---|---|
| `gemini-4-hydrogen` | 6.4 s | 4.0 s | ~9.9k |
| `gemini-4-carbon` | 7.2 s | 10.5 s | ~9.9k |
| `gemini-4-argon` | 10.1 s | 8.0 s | ~9.8k |
| `gemini-3.8-flash` | 7.0 s | 5.4 s | ~9.1k |
| `gemini-3.6-flash` | 6.0 s | 3.8 s | ~9.2k |
| `gemini-3.5-flash-lite` | 5.0 s | 3.0 s | ~9.1k |
| `gemini-4-neon` | accepted; see chain table | | |

- **Tail:** in 15 sequential, non-concurrent runs, 12 finished in 3–6 s, and the others took 9.9, 37.4, and 42.8 s. About 1 in 7 turns takes ~40 s for a one-token answer.
- Background `create()` returns in ~2.6 s for a fresh sandbox, ~1.0 s for a continuation or reused environment, and ~3 s for a saved-agent fork.
- A code-execution turn costs ~10.9k tokens (versus ~5k function-only) and takes ~5.4 s to the first step and ~9.6 s to done. Default tools with search cost ~20k.

## Concurrency

| burst | result | `create()` p50 / max | done p50 (from fire) |
|---|---|---|---|
| 10 fresh sandboxes | 10/10 | 4.0 / 4.3 s | 10.9 s |
| 50 fresh sandboxes | 50/50, no 429s | 8.6–15.2 / 16.2 s | 18–25 s |
| 50 on existing environments | 50/50 | 1.7 / 2.1 s | 14–18 s |
| 100 on existing environments | 100/100, no 429s | 2.4 / 2.7 s | 14.0 s |

- The cost of concurrency is server-side `create()` admission latency, and only for fresh sandboxes. Once created, agents run at baseline speed.
- Cold resume (environment idle more than 15 min) adds ~1.5–5 s at p50, with a tail to ~46 s.
- Up to 50 concurrent streams held cleanly from one client. Behaviour above 100 agents, and the real quota, are unknown.

## Prices (paid tier, per 1M tokens, at test time)

| model | input | cached | output + thinking | scheduled change |
|---|---|---|---|---|
| `gemini-4-hydrogen` | $1.50 | $0.075 | $7.50 | |
| `gemini-4-neon` | $3.00 | $0.15 | $15.00 | |
| `gemini-4-carbon`, `gemini-4-argon` | $2.00 | $0.10 | $10.00 | double 2026-12-01 |
| `gemini-3.8-flash`, `gemini-3.6-flash` | $0.75 | $0.075 | $3.75 | double 2027-01-01 |
| `gemini-3.5-flash-lite` | $0.30 | $0.03 | $2.50 | none announced |

- Cost = uncached input × input + cached × cached + (output + thought) × output. `total_input_tokens` includes `total_cached_tokens`, and thought tokens bill as output.
- Sandbox compute is free during preview. Billable tools are charged separately.
- Agent chains cached on every turn. (Plain `model=` calls cached unreliably, sometimes 0 for several turns.)
- Check https://aistudio.google.com/docs/pricing.md for current rates.

## Agent vs plain `model=` call (same chain)

Plain calls can set `generation_config.thinking_level` and reliably return thought summaries. Agents can do neither.

| setup | continuation p50 | $/turn |
|---|---|---|
| Hydrogen agent | 13 s | $0.021 |
| Hydrogen plain, `thinking_level: low` | 9 s | $0.009 |
| Hydrogen plain, default thinking | 19 s | $0.027 |
| Neon agent | 39 s | $0.098 |
| Neon plain, `thinking_level: low` | 26 s | $0.026 |
| Neon plain, default thinking | 158 s | $0.48 |

The agent appears to run each model at a lower, fixed effort than the plain default. The agent adds ~4.7k tokens of scaffold per turn over a plain call.
