// PiSeatDO: hosts Pi Durable (Cloudflare's PiHarness) for one pi seat (ADR-0003). The
// Player DO drives it over RPC through the pi Harness adapter (./index.ts). It is a
// separate DO because PiHarness's Lifecycle wants the alarm the Player DO polls on.
//
// - provision: creates the seat's Agent37 sandbox (egress deny-all) and persists its ID
//   before anything else, then stores the seat config and sets the session's model.
// - Game tools are the seat's fixed ToolSpecs as Pi ToolRegistrations. execute() asks the
//   Match whether a call is legal (validate only, ./turn.ts); the Player DO then records
//   the call through the normal submitAction path, exactly once.
// - A bash tool runs commands in the sandbox; the notes file lives there too.
// - close: deletes the sandbox. Never throws, so cleanup never blocks the Match.

import { DurableObject } from "cloudflare:workers";
import { Lifecycle } from "agents/lifecycle";
import { PiHarness } from "agents/harness/pi";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { createModels } from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import type { Usage, UsageReading } from "../../core/harness";
import type { ToolCall, ToolSpec } from "../../core/ruleset";
import { Agent37 } from "./agent37";
import { instanceName } from "./seat-name";
import { handleGameCall, type PiTurn, type TurnStore } from "./turn";

/** Bash and notes calls use turns too, so leave room beyond the in-run retries. */
export const PI_MAX_TURNS = 8;
/** Some OpenRouter endpoints (e.g. Hydrogen) refuse requests with reasoning off (measured: 400). */
export const PI_THINKING = "low";
/** The sandbox runs as user `node`, which cannot write /root (measured in the smoke Match). */
export const NOTES_PATH = "/home/node/notes.md";
const PLACEHOLDER_MODEL = "anthropic/claude-sonnet-5.5";
/** How long startTurn waits for an aborted earlier run to settle before submitting. */
const SETTLE_WAIT_MS = 5_000;

export interface PiSeatConfig {
  matchId: string;
  seat: number;
  model: string;
  tools: ToolSpec[];
  instructions?: string;
}

export type PiPoll =
  | { status: "pending" }
  | { status: "done"; call: ToolCall | null; usage: UsageReading[]; notes?: string }
  | { status: "error"; message: string; usage: UsageReading[] };

const SANDBOX_SECTION = [
  "You have a private Linux sandbox with no network access. Use the `bash` tool to run short commands in it.",
  `Keep notes for yourself in ${NOTES_PATH}; the file persists for the whole Match.`,
  `Each turn, before your game action, append one short line of what you learned to it (e.g. \`echo 'Day 1: ...' >> ${NOTES_PATH}\`), and read it back (\`cat ${NOTES_PATH}\`) when you need to remember earlier turns.`,
  "Act in the game only through the game tools. Call exactly one game tool per turn: the one the observation asks for.",
].join("\n");


type CatalogEntry = { id: string; api?: string; reasoning?: boolean; contextWindow?: number };

/** Prefer reasoning-capable entries (pi runs with thinkingLevel "low"), then the largest context window. */
function bestOf<M extends CatalogEntry>(entries: readonly M[]): M | undefined {
  return [...entries].sort((a, b) => Number(!!b.reasoning) - Number(!!a.reasoning) || (b.contextWindow ?? 0) - (a.contextWindow ?? 0))[0];
}

/**
 * The catalog entry a missing model is cloned from: the best same-vendor entry (same wire
 * format), else the best generic OpenAI-compatible (`openai-completions`) entry, else the
 * first. The vendor match is exact (`x-ai/`), so OpenRouter's `~x-ai/...` aliases don't count.
 */
export function templateFor<M extends CatalogEntry>(catalog: readonly M[], model: string): M | undefined {
  const vendor = model.split("/")[0] + "/";
  return bestOf(catalog.filter((m) => m.id.startsWith(vendor))) ?? bestOf(catalog.filter((m) => m.api === "openai-completions")) ?? catalog[0];
}

/**
 * Pi's OpenRouter catalog is stale (it lacks e.g. google/gemini-4-hydrogen, so runs end
 * `no_model`). Add a missing model by cloning a catalog entry (see templateFor). Prices
 * come from our PRICES table, not this entry.
 */
export function withModel<P extends { getModels(): readonly CatalogEntry[] }>(provider: P, model: string | undefined): P {
  if (!model) return provider;
  const catalog = provider.getModels();
  if (catalog.some((m) => m.id === model)) return provider;
  const template = templateFor(catalog, model);
  if (!template) return provider;
  const extra = { ...template, id: model, name: model };
  const models = [...catalog, extra];
  return new Proxy(provider, {
    get: (target, prop) => {
      if (prop === "getModels") return () => models;
      const all = (target as { getAllModels?: () => readonly unknown[] }).getAllModels;
      if (prop === "getAllModels" && all) return () => [...all.call(target), extra];
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

export class PiSeatDO extends DurableObject<Env> {
  private readonly harness: PiHarness;
  private readonly lifecycle: Lifecycle;
  private readonly models: ReturnType<typeof createModels>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const models = (this.models = createModels({
      authContext: { env: async (name: string) => (env as unknown as Record<string, string | undefined>)[name], fileExists: async () => false },
    } as Parameters<typeof createModels>[0]));
    const stored = this.config;
    models.setProvider(withModel(openrouterProvider(), stored?.model));
    this.harness = new PiHarness({
      harness: ({ storage, context, onWake }) => {
        const registry = createRegistry();
        const config = this.config;
        if (config) registry.install(this.extension(config) as never);
        return Harness.open(storage, { models, registry, onWake } as never, context);
      },
      defaults: { model: { provider: "openrouter", id: stored?.model ?? PLACEHOLDER_MODEL }, maxTurns: PI_MAX_TURNS, thinkingLevel: PI_THINKING },
    } as ConstructorParameters<typeof PiHarness>[0]);
    this.lifecycle = Lifecycle.install(this).use(this.harness);
  }

  private get config(): PiSeatConfig | undefined {
    return this.ctx.storage.kv.get<PiSeatConfig>("config");
  }

  private get instance(): string | undefined {
    return this.ctx.storage.kv.get<string>("instance");
  }

  private agent37(): Agent37 {
    if (!this.env.AGENT37_API_KEY) throw new Error("AGENT37_API_KEY is not set; the pi harness cannot run");
    return new Agent37(this.env.AGENT37_API_KEY);
  }

  private readonly turns: TurnStore = {
    get: () => this.ctx.storage.kv.get<PiTurn>("turn"),
    put: (t) => this.ctx.storage.kv.put("turn", t),
  };

  /** The seat's tools and Agent Instructions as one Pi extension. */
  private extension(config: PiSeatConfig) {
    const game = config.tools.map((spec) => ({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      executionMode: "sequential",
      execute: async (args: Record<string, unknown>) => {
        const opId = this.turns.get()?.opId ?? "";
        return handleGameCall(this.turns, opId, { name: spec.name, args }, async (turnId, call) =>
          this.env.MATCH.getByName(config.matchId).validateAction(turnId, config.seat, call),
        );
      },
    }));
    const bash = {
      name: "bash",
      description: "Run a short shell command in your private sandbox (no network). Returns stdout, stderr and the exit code.",
      parameters: { type: "object", properties: { command: { type: "string", description: "The command to run" } }, required: ["command"] },
      execute: async (args: { command: string }) => {
        const id = this.instance;
        if (!id) return { output: [{ type: "text", text: "No sandbox is available for this seat." }], isError: true };
        try {
          const r = await this.agent37().exec(id, String(args.command));
          const out = [r.stdout, r.stderr ? `stderr: ${r.stderr}` : "", r.error ? `error: ${r.error}` : "", `exit ${r.exit_code ?? "?"}`];
          return { output: [{ type: "text", text: out.filter(Boolean).join("\n").slice(0, 8000) }], isError: r.exit_code !== 0 };
        } catch (err) {
          return { output: [{ type: "text", text: `Sandbox command failed: ${String(err)}` }], isError: true };
        }
      },
    };
    const sections = [{ key: "sandbox", render: () => SANDBOX_SECTION }];
    if (config.instructions) sections.unshift({ key: "agent_instructions", render: () => config.instructions! });
    return { name: "game.seat", tools: [...game, bash], sections };
  }

  /** Create the sandbox (its ID persisted first), store the config and set the model. Idempotent. */
  async provision(config: PiSeatConfig): Promise<{ instance: string }> {
    let instance = this.instance;
    if (!instance) {
      // A create that succeeded before the DO died left a sandbox under this seat's name: adopt it.
      const name = instanceName(config.matchId, config.seat);
      const api = this.agent37();
      instance = (await api.list(name)).find((i) => i.name === name)?.id ?? (await api.create(name));
      this.ctx.storage.kv.put("instance", instance);
    }
    this.ctx.storage.kv.put("config", config);
    this.models.setProvider(withModel(openrouterProvider(), config.model));
    await this.lifecycle.start();
    await this.harness.session().setModel({ provider: "openrouter", id: config.model });
    return { instance };
  }

  /** Start a run for this turn. Re-sending the same opId is a no-op (Pi's idempotency key). */
  async startTurn(opId: string, turnId: string, text: string): Promise<void> {
    await this.lifecycle.start();
    const current = this.turns.get();
    if (current?.opId === opId) {
      await this.harness.submit(text, { operationId: opId });
      return;
    }
    // A run from an earlier turn must not answer this one: end it before submitting.
    if (current) this.turns.put({ ...current, cancelled: true });
    if ((await this.harness.pending()).length) {
      await this.harness.abort().catch(() => false);
      const until = Date.now() + SETTLE_WAIT_MS;
      while ((await this.harness.pending()).length && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
      // Game tools read the current turn, so never install it while the old run can still call them.
      // Throwing makes the Player DO's alarm retry this startTurn.
      if ((await this.harness.pending()).length) throw new Error("pi seat: the previous run has not settled yet");
    }
    this.turns.put({ opId, turnId, accepted: null });
    await this.harness.submit(text, { operationId: opId });
  }

  async poll(opId: string): Promise<PiPoll> {
    await this.lifecycle.start();
    const turn = this.turns.get();
    if (!turn || turn.opId !== opId || turn.cancelled) return { status: "error", message: `pi run ${opId} is no longer this seat's turn`, usage: [] };
    if (turn.accepted) {
      const notes = await this.readNotes();
      return { status: "done", call: turn.accepted, usage: await this.usage(), ...(notes ? { notes } : {}) };
    }
    const pending = await this.harness.pending();
    if (pending.some((p) => p.operationId === opId)) return { status: "pending" };
    const result = await this.harness.wait(opId);
    const usage = await this.usage();
    // Re-read: the accepting call may have landed as the run ended.
    const accepted = this.turns.get()?.accepted;
    if (accepted) return { status: "done", call: accepted, usage };
    if (result.status === "unanswered") return { status: "error", message: `pi run ended unanswered: ${result.reason ?? "unknown"}`, usage };
    return { status: "done", call: null, usage };
  }

  async cancel(opId: string): Promise<{ usage: UsageReading[] }> {
    await this.lifecycle.start();
    const turn = this.turns.get();
    if (turn?.opId === opId) this.turns.put({ ...turn, cancelled: true });
    await this.harness.abort({ operationId: opId }).catch(() => false);
    return { usage: await this.usage().catch(() => []) };
  }

  /** The Match is over: delete the sandbox and report usage. Never throws. */
  async close(): Promise<{ usage: UsageReading[]; deleted: boolean }> {
    let usage: UsageReading[] = [];
    try {
      await this.lifecycle.start();
      await this.harness.abort().catch(() => false);
      usage = await this.usage();
    } catch {
      // Usage is best effort here; the last poll already reported it.
    }
    const deleted = await this.deleteInstance();
    return { usage, deleted };
  }

  /** The seat's notes file for Narrator's View (wl-rhpr). Best effort and bounded: never fails a turn. */
  private async readNotes(): Promise<string | undefined> {
    const id = this.instance;
    if (!id) return undefined;
    try {
      const r = await this.agent37().exec(id, `cat ${NOTES_PATH} 2>/dev/null | tail -c 4000`, 3_000);
      return r.exit_code === 0 && r.stdout?.trim() ? r.stdout : undefined;
    } catch {
      return undefined;
    }
  }

  private async deleteInstance(): Promise<boolean> {
    const id = this.instance;
    if (!id) return true;
    try {
      await this.agent37().delete(id);
      this.ctx.storage.kv.delete("instance");
      return true;
    } catch (err) {
      console.warn(`pi seat: agent37 delete ${id} failed: ${String(err)}`);
      return false;
    }
  }

  /**
   * Cumulative usage of the seat's session as one reading (a stable ID, so the latest replaces
   * earlier ones). Each transcript entry is counted once into a persisted total, so entries
   * that later fall out of the transcript window stay counted. pi-ai's `input` excludes cache
   * reads and its `output` includes reasoning.
   */
  private async usage(): Promise<UsageReading[]> {
    const config = this.config;
    if (!config) return [];
    const entries = await this.harness.messages();
    // Synchronous from here on, so concurrent calls never count an entry twice.
    const counted = new Set(this.ctx.storage.kv.get<string[]>("usageCounted") ?? []);
    const total: Usage = { ...{ input: 0, cached: 0, thought: 0, output: 0 }, ...this.ctx.storage.kv.get<Usage>("usageTotal") };
    for (const entry of entries) {
      if (counted.has(String(entry.id))) continue;
      counted.add(String(entry.id));
      for (const m of (entry.model ?? []) as unknown as readonly { role?: string; usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; reasoning?: number } }[]) {
        const u = m.role === "assistant" ? m.usage : undefined;
        if (!u) continue;
        const cached = u.cacheRead ?? 0;
        const reasoning = u.reasoning ?? 0;
        total.input += (u.input ?? 0) + cached + (u.cacheWrite ?? 0);
        total.cached += cached;
        total.thought += reasoning;
        total.output += Math.max(0, (u.output ?? 0) - reasoning);
      }
    }
    this.ctx.storage.kv.put("usageCounted", [...counted]);
    this.ctx.storage.kv.put("usageTotal", total);
    return [{ id: `pi:${config.matchId}:${config.seat}`, model: config.model, usage: total }];
  }
}
