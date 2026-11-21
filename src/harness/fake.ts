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

import type { Harness, PollResult, TurnInput } from "../core/harness";
import type { ToolCall } from "../core/ruleset";

interface FakeOptions {
  script?: "first-legal" | "passive" | "no-call" | "silent";
  prefer?: number[];
  invalidFirst?: boolean;
  delayPolls?: number;
  silentTurns?: number[];
  requireText?: string[];
  say?: string;
}

function decide(opts: FakeOptions, input: TurnInput, turnNo: number): ToolCall | null | "never" {
  const { turn } = input;
  if (opts.script === "silent" || opts.silentTurns?.includes(turnNo)) return "never";
  if (opts.requireText?.some((t) => !input.text.includes(t))) return null;
  if (opts.script === "no-call") return null;
  if (opts.invalidFirst && !input.error) return { name: turn.actionKind, args: { target: "not-a-seat" } };
  if (opts.say !== undefined && turn.legalTargets.length === 0) return { name: turn.actionKind, args: { text: opts.say } };
  const preferred = opts.prefer?.find((s) => turn.legalTargets.includes(s));
  const extra = turn.actionKind === "vote" ? { beliefs: {}, reason: "scripted" } : {};
  if (preferred !== undefined) return { name: turn.actionKind, args: { target: preferred, ...extra } };
  if (opts.script === "passive") {
    return turn.actionKind === "vote" && turn.legalTargets.includes("abstain")
      ? { name: "vote", args: { target: "abstain", ...extra } }
      : null;
  }
  const first = turn.legalTargets[0];
  return first === undefined ? null : { name: turn.actionKind, args: { target: first, ...extra } };
}

export const fakeHarness: Harness = {
  async provision(ctx) {
    return { ...ctx.chain, environment: `fake-env-${ctx.matchId}-${ctx.seat}`, turns: 0 };
  },
  async startTurn(ctx, input) {
    const opts = (ctx.agent.options ?? {}) as FakeOptions;
    const turns = Number(ctx.chain.turns ?? 0) + 1;
    return {
      handle: { decision: decide(opts, input, turns), pollsLeft: opts.delayPolls ?? 0 },
      chain: { ...ctx.chain, turns },
    };
  },
  async poll(_ctx, handle): Promise<PollResult> {
    const decision = handle.decision as ToolCall | null | "never";
    const pollsLeft = Number(handle.pollsLeft ?? 0);
    if (decision === "never") return { status: "pending", handle };
    if (pollsLeft > 0) return { status: "pending", handle: { ...handle, pollsLeft: pollsLeft - 1 } };
    return { status: "done", call: decision };
  },
};
