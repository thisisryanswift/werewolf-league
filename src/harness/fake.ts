// Scripted Fake Harness: replaces Gemini in tests and local demos.
// Behaviour comes from the Agent's `options` (all JSON, so it survives DO hops):
//   script: "first-legal" (default) — call the required tool with the first legal target
//           "passive"               — vote Abstain, otherwise end the turn with no call (default action)
//           "no-call"               — end every turn with no call (every action is the default)
//           "silent"                — never finish a turn
//   prefer: seat[]      — for targeted actions, pick the first preferred seat that is legal
//   invalidFirst: bool  — answer every turn with an illegal call first, then a legal one on retry
//   delayPolls: number  — report "pending" this many polls before answering
//   silentTurns: number[] — never finish these turns (1-based count of turns started on this seat)
//   requireText: string[] — end the turn with no call unless the observation contains every string
//   say: string         — for actions without legal targets (e.g. a chat), call the tool with { text: say }
//   args: { [actionKind]: object } — extra call arguments per action kind, over the defaults below
//   echo: string        — put a digest of the observation into this argument (tests compare observations)
//   usage: Usage        — bill every interaction (each started turn, including invalid-call retries) this
//                         usage, on the Agent's model (or "fake"); reported when it ends or is cancelled
//   setupUsage: Usage   — bill the seat's setup this usage; reported by its first turn, or by close() if it had none
//   rateLimitTurns: number[] — the first poll of these turns is refused with a 429 (1-based, like silentTurns)
//   pollEveryMs: number — ask the Player DO to poll no more often than this (keeps big test Leagues cheap)
//   rateLimitPolls: number — the first this-many polls of every turn are refused with a 429 (sustained 429s)
//   rateLimitProvision: bool — the seat's first provision attempt throws a 429 (later attempts succeed)

import type { Harness, PlayerContext, PollResult, TurnHandle, TurnInput, Usage, UsageReading } from "../core/harness";
import type { ToolCall } from "../core/ruleset";

interface FakeOptions {
  script?: "first-legal" | "passive" | "no-call" | "silent";
  prefer?: number[];
  invalidFirst?: boolean;
  delayPolls?: number;
  silentTurns?: number[];
  requireText?: string[];
  say?: string;
  args?: Record<string, Record<string, unknown>>;
  echo?: string;
  usage?: Usage;
  setupUsage?: Usage;
  rateLimitTurns?: number[];
  pollEveryMs?: number;
  rateLimitProvision?: boolean;
  rateLimitPolls?: number;
}

/** The scripted setup usage, while the seat's setup is still unreported. */
function setupUsageOf(ctx: PlayerContext): UsageReading[] {
  const usage = (ctx.agent.options as FakeOptions | undefined)?.setupUsage;
  if (!usage || !ctx.chain.setupPending) return [];
  return [{ id: `${ctx.matchId}:${ctx.seat}:setup`, model: ctx.agent.model ?? "fake", usage }];
}

/** The scripted usage of the interaction behind `handle`, if any. */
function usageOf(ctx: PlayerContext, handle: TurnHandle): { usage?: UsageReading[] } {
  const usage = (ctx.agent.options as FakeOptions | undefined)?.usage;
  if (!usage) return {};
  return { usage: [{ id: String(handle.interaction), model: ctx.agent.model ?? "fake", usage }] };
}

/** Seats whose one refused provision attempt has happened (per isolate; enough for tests). */
const provisionRefused = new Set<string>();

/** Default extra arguments per action kind, so scripted calls are well-formed. */
const DEFAULT_ARGS: Record<string, Record<string, unknown>> = {
  vote: { beliefs: {}, reason: "scripted" },
  speak: { text: "scripted" },
};

/** Short stable digest of a string (FNV-1a). */
function digest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function decide(opts: FakeOptions, input: TurnInput, turnNo: number): ToolCall | null | "never" {
  const { turn } = input;
  if (opts.script === "silent" || opts.silentTurns?.includes(turnNo)) return "never";
  if (opts.requireText?.some((t) => !input.text.includes(t))) return null;
  if (opts.script === "no-call") return null;
  if (opts.invalidFirst && !input.error) return { name: turn.actionKind, args: { target: "not-a-seat" } };
  if (opts.say !== undefined && turn.legalTargets.length === 0) return { name: turn.actionKind, args: { text: opts.say } };
  const preferred = opts.prefer?.find((s) => turn.legalTargets.includes(s));
  const extra: Record<string, unknown> = { ...DEFAULT_ARGS[turn.actionKind], ...opts.args?.[turn.actionKind] };
  if (opts.echo) extra[opts.echo] = `${String(extra[opts.echo] ?? "")} [obs ${digest(input.text)}]`.trim();
  if (preferred !== undefined) return { name: turn.actionKind, args: { target: preferred, ...extra } };
  if (opts.script === "passive") {
    return turn.actionKind === "vote" && turn.legalTargets.includes("abstain")
      ? { name: "vote", args: { target: "abstain", ...extra } }
      : null;
  }
  const first = turn.legalTargets[0];
  if (first === undefined) return DEFAULT_ARGS[turn.actionKind] || opts.args?.[turn.actionKind] ? { name: turn.actionKind, args: extra } : null;
  return { name: turn.actionKind, args: { target: first, ...extra } };
}

export const fakeHarness: Harness = {
  async provision(ctx) {
    const key = `${ctx.matchId}:${ctx.seat}`;
    if ((ctx.agent.options as FakeOptions | undefined)?.rateLimitProvision && !provisionRefused.has(key)) {
      provisionRefused.add(key);
      throw Object.assign(new Error("fake 429: quota exhausted"), { status: 429 });
    }
    // Records the Agent Instructions it was given, so tests can check what each seat got.
    return {
      ...ctx.chain,
      environment: `fake-env-${ctx.matchId}-${ctx.seat}`,
      turns: 0,
      instructions: ctx.instructions,
      setupPending: true,
    };
  },
  async startTurn(ctx, input) {
    const opts = (ctx.agent.options ?? {}) as FakeOptions;
    const turns = Number(ctx.chain.turns ?? 0) + 1;
    const setup = setupUsageOf(ctx);
    return {
      ...(setup.length ? { usage: setup } : {}),
      handle: {
        decision: decide(opts, input, turns),
        pollsLeft: opts.delayPolls ?? 0,
        interaction: `${ctx.matchId}:${ctx.seat}:${turns}`,
        rateLimited: opts.rateLimitTurns?.includes(turns) ?? false,
        rateLimitPollsLeft: opts.rateLimitPolls ?? 0,
        pollEveryMs: opts.pollEveryMs ?? 0,
      },
      chain: { ...ctx.chain, turns, setupPending: false },
    };
  },
  async poll(ctx, handle): Promise<PollResult> {
    const decision = handle.decision as ToolCall | null | "never";
    const pollsLeft = Number(handle.pollsLeft ?? 0);
    const retryAfterMs = Number(handle.pollEveryMs ?? 0) || undefined;
    const refusals = Number(handle.rateLimitPollsLeft ?? 0);
    if (refusals > 0) return { status: "pending", handle: { ...handle, rateLimitPollsLeft: refusals - 1 }, rateLimited: true, retryAfterMs };
    if (handle.rateLimited) return { status: "pending", handle: { ...handle, rateLimited: false }, rateLimited: true, retryAfterMs };
    if (decision === "never") return { status: "pending", handle, retryAfterMs };
    if (pollsLeft > 0) return { status: "pending", handle: { ...handle, pollsLeft: pollsLeft - 1 }, retryAfterMs };
    return { status: "done", call: decision, ...usageOf(ctx, handle) };
  },
  async cancel(ctx, handle) {
    return usageOf(ctx, handle);
  },
  async close(ctx) {
    const usage = setupUsageOf(ctx);
    return { chain: { ...ctx.chain, setupPending: false }, ...(usage.length ? { usage } : {}) };
  },
};
