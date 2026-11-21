// Managed Agent harness: plays a seat through a Gemini Managed Agent interaction chain.
//
// - provision(): creates the seat's environment at Match start with a setup interaction on
//   "remote" and returns its IDs at once, so they are persisted before anything else. The
//   seat's Agent Instructions are mounted as /.agents/AGENTS.md through an `inline` source
//   (wl-cizy probe: a function-only agent follows it, on fresh chains and continuations).
//   The setup interaction is cancelled when the first turn starts (M1: environment_id is
//   on the create() response and survives the cancel).
// - startTurn(): a first turn (`input.firstTurn`) starts a chain on the seat's environment
//   with the Match's text (briefing + observation); later turns
//   chain with previous_interaction_id + environment and put the observation inside the
//   previous call's function_result. Tools are the seat's fixed list, resent identically
//   every turn (ADR-0002).
// - Recovery (wl-nos5, both paths confirmed in M1): a turn that timed out is cancelled. The
//   Match repeats every event since the seat's last answered turn (and after a missed first
//   turn sends `firstTurn: true` with the briefing again). After a timed-out continuation,
//   the next turn answers the parent's still-pending call; after a timed-out first turn it
//   starts a fresh chain on the same environment. A cancelled interaction's call is never
//   returned by poll(). If a chain can't be continued at all (rejected continuation, or the
//   Agent ended a turn without a call), the harness restarts it from its own transcript.
//
// All state lives in the JSON `chain` the Player DO persists. startTurn reconciles the
// previous in-flight interaction itself, so it works whether or not cancel() was called.

import type { AgentConfig, Harness, PlayerContext, PollResult, TurnHandle, TurnInput, UsageReading } from "../../core/harness";
import type { ToolSpec } from "../../core/ruleset";
import { ACTIVE, AGENT, ApiError, type Fetch, type Interaction, InteractionsClient, pendingCalls, readUsage } from "./api";

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
  /** Setup interaction from provision(), cancelled when the first turn starts. */
  setupInteraction?: string;
  /** Settled interactions whose usage could not be read yet (billed all the same); close() reads them. */
  unread?: string[];
}

const withUnread = (chain: Chain, id: string): Chain => ({ ...chain, unread: [...new Set([...(chain.unread ?? []), id])] });

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
const SETUP_CANCEL_TIMEOUT_MS = 5_000;
const EXTRA_CALL = "Only one action per turn counts; this call was ignored.";

export interface ManagedAgentOptions {
  apiKey: string | undefined;
  fetch?: Fetch;
}

/** Join observations, marking all but the last as earlier turns whose requests are over. */
function markEarlier(entries: string[]): string {
  return entries.map((e, i) => (i < entries.length - 1 ? `${EARLIER}\n${e}` : e)).join("\n\n");
}

export function toApiTools(tools: ToolSpec[]) {
  return tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));
}

const modelOf = (agent: AgentConfig) => agent.model ?? DEFAULT_MODEL;

function agentConfig(agent: AgentConfig) {
  const max = Number(agent.options?.maxTotalTokens ?? DEFAULT_MAX_TOTAL_TOKENS);
  return { type: "antigravity", model: modelOf(agent), max_total_tokens: max };
}

/** Bound on the read after a cancel, so a hung API never holds up a turn for long. */
const CANCEL_READ_TIMEOUT_MS = 5_000;

function base(ctx: PlayerContext) {
  if (ctx.tools.length === 0) throw new Error(`seat ${ctx.seat} has no tools; an empty list means default tools`);
  return { agent: AGENT, agent_config: agentConfig(ctx.agent), tools: toApiTools(ctx.tools), background: true, store: true };
}

/** Where the seat's Agent Instructions are mounted; the agent reads it when each interaction starts. */
export const AGENTS_MD = "/.agents/AGENTS.md";

/**
 * A new sandbox, with the seat's Agent Instructions mounted through the documented
 * `inline` source. The file stays in the environment, so every later chain on it
 * (continuations, and the fresh chain after a first-turn timeout) keeps it.
 */
function environmentConfig(ctx: PlayerContext) {
  if (!ctx.instructions) return "remote";
  return { type: "remote", sources: [{ type: "inline", target: AGENTS_MD, content: ctx.instructions }] };
}

const toolNames = (ctx: PlayerContext) => ctx.tools.map((t) => t.name);

export function managedAgentHarness(opts: ManagedAgentOptions): Harness {
  if (!opts.apiKey) throw new Error("GEMINI_API_KEY is not set; the managed-agent harness cannot run");
  // Late-bound so the Worker's global fetch is used at call time.
  const api = new InteractionsClient(opts.apiKey, opts.fetch ?? ((i, init) => fetch(i, init)));

  const usageOf = (ctx: PlayerContext, it: Interaction): UsageReading[] => {
    const r = readUsage(it, modelOf(ctx.agent));
    return r ? [r] : [];
  };

  /**
   * Cancel an interaction; returns the cancel response, which may carry its usage (its tokens were billed).
   * Never throws.
   */
  async function cancelForUsage(id: string, timeoutMs?: number): Promise<Interaction | null> {
    // No extra read here: it would lengthen every timed-out turn. Usage missing from the
    // cancel response is read later (the next turn's reconcile, or close()).
    return api.cancel(id, timeoutMs).catch(() => null);
  }

  /** Settle the previous in-flight interaction and fold its outcome into the chain. */
  async function reconcile(ctx: PlayerContext, chain: Chain): Promise<{ chain: Chain; usage: UsageReading[] }> {
    const f = chain.inFlight;
    if (!f) return { chain, usage: [] };
    let it: Interaction = await api.get(f.id);
    let cancelled = !!f.cancelled;
    if (ACTIVE.has(it.status)) {
      // A new turn arrived while this one was still running: its turn is over.
      it = (await cancelForUsage(f.id)) ?? it;
      cancelled = true;
    }
    const usage = usageOf(ctx, it);
    const settled = settle(ctx, chain, f, it, cancelled);
    return { chain: usage.length ? settled : withUnread(settled, f.id), usage };
  }

  /** Fold a settled in-flight interaction's outcome into the chain. */
  function settle(ctx: PlayerContext, chain: Chain, f: InFlight, it: Interaction, cancelled: boolean): Chain {
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
    // parent and its still-pending call. The Match repeats the missed events in the next
    // observation, so drop the unseen entries from the transcript.
    return {
      ...chain,
      inFlight: null,
      parent: f.parent,
      transcript: chain.transcript.slice(0, chain.delivered),
      note: NOTE_TIMED_OUT,
    };
  }

  function freshInput(ctx: PlayerContext, chain: Chain, error: string | undefined): string {
    // The Agent Instructions are not repeated here: they stay mounted in the environment.
    const parts = [PREAMBLE];
    const restart = chain.transcript.length > 1;
    if (restart || chain.note) parts.push([chain.note, restart ? NOTE_RESTART : null].filter(Boolean).join(" "));
    parts.push(markEarlier(chain.transcript));
    if (error) parts.push(`Your last call was rejected: ${error}`);
    return parts.join("\n\n");
  }

  function continuationInput(chain: Chain, parent: Parent, input: TurnInput) {
    const { error } = input;
    // An invalid-call retry repeats the frozen observation the Agent has already seen.
    const observation = error ? "" : input.text;
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
        environment: environmentConfig(ctx),
        input: `${PREAMBLE}\n\nSetup only: your sandbox is being prepared. Do nothing; the Match starts soon.`,
      });
      const environment = setup.environment_id ?? (await api.get(setup.id)).environment_id;
      if (!environment) throw new Error(`setup interaction ${setup.id} returned no environment_id`);
      const chain: Chain = {
        environment,
        parent: null,
        transcript: [],
        delivered: 0,
        inFlight: null,
        setupInteraction: setup.id,
      };
      return chain as unknown as Record<string, unknown>;
    },

    async startTurn(ctx, input: TurnInput) {
      let chain = ctx.chain as unknown as Chain;
      const usage: UsageReading[] = [];
      if (chain.setupInteraction) {
        // Best effort and bounded: the setup interaction is never continued. It ran the model, so it is billed.
        const id = chain.setupInteraction;
        const setup = await cancelForUsage(id, SETUP_CANCEL_TIMEOUT_MS);
        const read = setup ? usageOf(ctx, setup) : [];
        usage.push(...read);
        chain = { ...chain, setupInteraction: undefined };
        if (!read.length) chain = withUnread(chain, id);
      }
      const settled = await reconcile(ctx, chain);
      chain = settled.chain;
      usage.push(...settled.usage);
      // An invalid-call retry repeats the same frozen observation, which the Agent has seen.
      if (input.firstTurn && !input.error) {
        // The Match's first-turn text holds the briefing and everything seen so far:
        // start the chain (again, after a missed first turn) from it alone.
        chain = { ...chain, parent: null, transcript: [input.text], delivered: 0 };
      } else if (!input.error) {
        chain = { ...chain, transcript: [...chain.transcript, input.text] };
      }
      const upTo = chain.transcript.length;

      let created: Interaction | null = null;
      let parent = chain.parent;
      if (parent) {
        try {
          created = await api.create({
            ...base(ctx),
            previous_interaction_id: parent.id,
            environment: chain.environment,
            input: continuationInput(chain, parent, input),
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
        inFlight: { id: created.id, parent, upTo },
      };
      return {
        handle: { interactionId: created.id },
        chain: next as unknown as Record<string, unknown>,
        ...(usage.length ? { usage } : {}),
      };
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
        if (err instanceof ApiError && err.status === 429) return { status: "pending", handle, rateLimited: true };
        if (err instanceof ApiError && err.status >= 500) return { status: "pending", handle };
        throw err;
      }
      if (ACTIVE.has(it.status)) return { status: "pending", handle };
      const usage = usageOf(ctx, it);
      const withUsage = usage.length ? { usage } : {};
      if (it.status === "requires_action" || it.status === "completed") {
        const call = it.status === "requires_action" ? pendingCalls(it, toolNames(ctx))[0] : undefined;
        return { status: "done", call: call ? { name: call.name, args: call.args } : null, ...withUsage };
      }
      return { status: "error", message: `interaction ${id} ended ${it.status}`, ...withUsage };
    },

    async close(ctx) {
      const chain = ctx.chain as unknown as Chain;
      // The setup interaction (a seat that never took a turn), any settled interaction whose
      // usage could not be read, and a last interaction that was cancelled: read each one's final usage.
      const ids = [
        ...new Set([chain.setupInteraction, ...(chain.unread ?? []), chain.inFlight?.cancelled ? chain.inFlight.id : undefined].filter((x): x is string => !!x)),
      ];
      if (!ids.length) return;
      const usage: UsageReading[] = [];
      for (const id of ids) {
        // Throws if the API can't be read, so the caller retries the close.
        let it = await api.get(id, CANCEL_READ_TIMEOUT_MS);
        if (ACTIVE.has(it.status)) {
          await api.cancel(id, SETUP_CANCEL_TIMEOUT_MS);
          it = await api.get(id, CANCEL_READ_TIMEOUT_MS);
        }
        usage.push(...usageOf(ctx, it));
      }
      return {
        chain: { ...chain, setupInteraction: undefined, unread: [] } as unknown as Record<string, unknown>,
        ...(usage.length ? { usage } : {}),
      };
    },

    async cancel(ctx, handle) {
      const chain = ctx.chain as unknown as Chain;
      const f = chain.inFlight;
      if (!f || f.id !== handle.interactionId) return;
      const it = await cancelForUsage(f.id);
      const usage = it ? usageOf(ctx, it) : [];
      return {
        chain: { ...chain, inFlight: { ...f, cancelled: true } } as unknown as Record<string, unknown>,
        ...(usage.length ? { usage } : {}),
      };
    },
  };
}
