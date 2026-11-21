// Managed Agent harness: plays a seat through a Gemini Managed Agent interaction chain.
//
// - provision(): creates the seat's environment at Match start (a setup interaction on
//   "remote", cancelled at once; M1 showed environment_id is on the create() response and
//   survives the cancel).
// - startTurn(): first turn (or a fresh chain) sends the Agent Instructions plus everything
//   the seat has been shown; later turns chain with previous_interaction_id + environment and
//   put the new observation inside the previous call's function_result. Tools are the seat's
//   fixed list, resent identically every turn (ADR-0002).
// - Recovery (wl-nos5, both paths confirmed in M1): a turn that timed out is cancelled. If it
//   had a parent, the next turn answers the parent's still-pending call; if it was a first
//   turn, the next turn starts a fresh chain on the same environment with a full catch-up.
//   Either way the result carries every observation the seat missed. A cancelled
//   interaction's call is never returned by poll().
//
// All state lives in the JSON `chain` the Player DO persists. startTurn reconciles the
// previous in-flight interaction itself, so it works whether or not cancel() was called.

import type { AgentConfig, Harness, PlayerContext, PollResult, TurnHandle, TurnInput } from "../../core/harness";
import type { ToolSpec } from "../../core/ruleset";
import { ACTIVE, AGENT, ApiError, type Fetch, type Interaction, InteractionsClient, pendingCalls } from "./api";

export const MANAGED_AGENT_HARNESS_ID = "managed-agent";
export const DEFAULT_MODEL = "gemini-4-hydrogen";
export const DEFAULT_MAX_TOTAL_TOKENS = 100_000;

interface PendingCall {
  id: string;
  name: string;
}

/** The interaction the next continuation answers, with its unanswered game calls. */
interface Parent {
  id: string;
  calls: PendingCall[];
}

interface InFlight {
  id: string;
  /** Parent this interaction continued (null: it started a fresh chain). */
  parent: Parent | null;
  /** Transcript length once this interaction has been seen by the Agent. */
  upTo: number;
  startedAt: number;
  /** Set by cancel(): the turn is over and its call must never be reported. */
  cancelled?: boolean;
}

interface Chain {
  environment: string;
  /** Interaction to continue from; null means the next turn starts a fresh chain. */
  parent: Parent | null;
  /** Every observation the Match gave this seat, in order (the first holds the briefing). */
  transcript: string[];
  /** How many transcript entries the Agent has actually seen. */
  delivered: number;
  inFlight: InFlight | null;
  /** Said once in the next result, e.g. that the last turn timed out. */
  note?: string;
}

export const PREAMBLE = [
  "You are an Agent playing one seat in a Match of a game league.",
  "Act only by calling the game tools you were given. Call exactly one tool per turn: the one the game asks for.",
  "Do not run code or browse. Each tool result tells you what happened since your last action and what to do next.",
].join(" ");

export const NOTE_TIMED_OUT =
  "Your previous turn ran past its deadline and was cancelled, so the default action was used. The observation below includes everything you missed.";
export const NOTE_TOO_LATE = "Your last call arrived after the deadline and was not used; the default action was used instead.";
const NOTE_RESTART = "Your earlier conversation could not be continued. Everything you have been told so far follows.";
const EARLIER = "[Earlier turn, now over; for context only]";
const EXTRA_CALL = "Only one action per turn counts; this call was ignored.";

export interface ManagedAgentOptions {
  apiKey: string | undefined;
  fetch?: Fetch;
  /** Clock, for tests. */
  now?: () => number;
  /**
   * Watchdog: a poll that finds the turn still running after this long cancels it and
   * reports an error. Deadlines proper belong to the Player DO; this only stops a stuck
   * interaction hanging a Match. 0 disables it.
   */
  maxTurnMs?: number;
}

/** Join observations, marking all but the last as earlier turns whose requests are over. */
function markEarlier(entries: string[]): string {
  return entries.map((e, i) => (i < entries.length - 1 ? `${EARLIER}\n${e}` : e)).join("\n\n");
}

export function toApiTools(tools: ToolSpec[]) {
  return tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));
}

function agentConfig(agent: AgentConfig) {
  const max = Number(agent.options?.maxTotalTokens ?? DEFAULT_MAX_TOTAL_TOKENS);
  return { type: "antigravity", model: agent.model ?? DEFAULT_MODEL, max_total_tokens: max };
}

function base(ctx: PlayerContext) {
  if (ctx.tools.length === 0) throw new Error(`seat ${ctx.seat} has no tools; an empty list means default tools`);
  return { agent: AGENT, agent_config: agentConfig(ctx.agent), tools: toApiTools(ctx.tools), background: true, store: true };
}

const toolNames = (ctx: PlayerContext) => ctx.tools.map((t) => t.name);

export function managedAgentHarness(opts: ManagedAgentOptions): Harness {
  if (!opts.apiKey) throw new Error("GEMINI_API_KEY is not set; the managed-agent harness cannot run");
  // Late-bound so the Worker's global fetch is used at call time.
  const api = new InteractionsClient(opts.apiKey, opts.fetch ?? ((i, init) => fetch(i, init)));
  const now = opts.now ?? Date.now;
  const maxTurnMs = opts.maxTurnMs ?? 0;

  /** Settle the previous in-flight interaction and fold its outcome into the chain. */
  async function reconcile(ctx: PlayerContext, chain: Chain): Promise<Chain> {
    const f = chain.inFlight;
    if (!f) return chain;
    let it: Interaction = await api.get(f.id);
    let cancelled = !!f.cancelled;
    if (ACTIVE.has(it.status)) {
      // A new turn arrived while this one was still running: its turn is over.
      it = await api.cancel(f.id).catch(() => it);
      cancelled = true;
    }
    const calls = it.status === "requires_action" ? pendingCalls(it, toolNames(ctx)) : [];
    if (calls.length > 0) {
      // It landed (perhaps after its deadline); its calls are now the ones to answer.
      return {
        ...chain,
        inFlight: null,
        parent: { id: it.id, calls: calls.map(({ id, name }) => ({ id, name })) },
        delivered: f.upTo,
        note: cancelled ? NOTE_TOO_LATE : undefined,
      };
    }
    if (it.status === "completed" || it.status === "requires_action") {
      // Ended without a game call: nothing to answer, so the next turn starts a fresh chain.
      return { ...chain, inFlight: null, parent: null, delivered: f.upTo, note: undefined };
    }
    // Cancelled, failed or incomplete: the Agent never saw this observation. Keep the
    // parent and its still-pending call, and resend what was missed.
    return { ...chain, inFlight: null, parent: f.parent, note: NOTE_TIMED_OUT };
  }

  function freshInput(ctx: PlayerContext, chain: Chain, error: string | undefined): string {
    const parts = [PREAMBLE];
    if (ctx.agent.instructions) parts.push(`Agent Instructions:\n${ctx.agent.instructions}`);
    if (chain.transcript.length > 1 || chain.note) parts.push([chain.note, NOTE_RESTART].filter(Boolean).join(" "));
    parts.push(markEarlier(chain.transcript));
    if (error) parts.push(`Your last call was rejected: ${error}`);
    return parts.join("\n\n");
  }

  function continuationInput(chain: Chain, parent: Parent, error: string | undefined) {
    const observation = markEarlier(chain.transcript.slice(chain.delivered));
    const main: Record<string, unknown> = { accepted: !error && chain.note !== NOTE_TOO_LATE };
    if (error) main.error = error;
    if (chain.note) main.note = chain.note;
    if (observation) main.observation = observation;
    return parent.calls.map((c, i) => ({
      type: "function_result",
      name: c.name,
      call_id: c.id,
      result: i === 0 ? main : { accepted: false, error: EXTRA_CALL },
    }));
  }

  return {
    async provision(ctx) {
      const setup = await api.create({
        ...base(ctx),
        environment: "remote",
        input: `${PREAMBLE}\n\nSetup only: your sandbox is being prepared. Do nothing; the Match starts soon.`,
      });
      const environment = setup.environment_id ?? (await api.get(setup.id)).environment_id;
      // Best effort: the setup interaction is never continued.
      await api.cancel(setup.id).catch(() => undefined);
      if (!environment) throw new Error("setup interaction returned no environment_id");
      const chain: Chain = { environment, parent: null, transcript: [], delivered: 0, inFlight: null };
      return { ...chain, setupInteraction: setup.id };
    },

    async startTurn(ctx, input: TurnInput) {
      let chain = await reconcile(ctx, ctx.chain as unknown as Chain);
      // An invalid-call retry repeats the same frozen observation, which the Agent has seen.
      if (!input.error) chain = { ...chain, transcript: [...chain.transcript, input.text] };
      const upTo = chain.transcript.length;

      let created: Interaction | null = null;
      let parent = chain.parent;
      if (parent) {
        try {
          created = await api.create({
            ...base(ctx),
            previous_interaction_id: parent.id,
            environment: chain.environment,
            input: continuationInput(chain, parent, input.error),
          });
        } catch (err) {
          // The chain can't be continued (e.g. 4xx); restart it on the same environment.
          // Transient (5xx, 429): rethrow so the Player DO's alarm retries the same turn.
          if (!(err instanceof ApiError) || err.status >= 500 || err.status === 429) throw err;
          console.warn(`managed-agent seat ${ctx.seat}: continuation rejected, restarting chain: ${err.message}`);
          parent = null;
        }
      }
      if (!created) {
        created = await api.create({ ...base(ctx), environment: chain.environment, input: freshInput(ctx, chain, input.error) });
      }
      const next: Chain = {
        ...chain,
        parent,
        note: undefined,
        inFlight: { id: created.id, parent, upTo, startedAt: now() },
      };
      return { handle: { interactionId: created.id }, chain: next as unknown as Record<string, unknown> };
    },

    async poll(ctx, handle: TurnHandle): Promise<PollResult> {
      const id = String(handle.interactionId);
      const f = (ctx.chain as unknown as Chain).inFlight;
      // A late result from a cancelled (or superseded) interaction never reaches the Match.
      if (!f || f.id !== id || f.cancelled) return { status: "error", message: `interaction ${id} is no longer this seat's turn` };
      let it: Interaction;
      try {
        it = await api.get(id);
      } catch (err) {
        if (err instanceof ApiError && (err.status >= 500 || err.status === 429)) return { status: "pending", handle };
        throw err;
      }
      if (ACTIVE.has(it.status)) {
        if (maxTurnMs > 0 && now() - f.startedAt > maxTurnMs) {
          await api.cancel(id).catch(() => undefined);
          return { status: "error", message: `interaction ${id} ran past ${maxTurnMs} ms and was cancelled` };
        }
        return { status: "pending", handle };
      }
      if (it.status === "requires_action" || it.status === "completed") {
        const call = it.status === "requires_action" ? pendingCalls(it, toolNames(ctx))[0] : undefined;
        return { status: "done", call: call ? { name: call.name, args: call.args } : null };
      }
      return { status: "error", message: `interaction ${id} ended ${it.status}` };
    },

    async cancel(ctx, handle) {
      const chain = ctx.chain as unknown as Chain;
      const f = chain.inFlight;
      if (!f || f.id !== handle.interactionId) return ctx.chain;
      await api.cancel(f.id).catch(() => undefined);
      return { ...chain, inFlight: { ...f, cancelled: true } } as unknown as Record<string, unknown>;
    },
  };
}
