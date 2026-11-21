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
import { handleGameCall, type PiTurn, type TurnStore } from "./turn";

/** Bash and notes calls use turns too, so leave room beyond the in-run retries. */
export const PI_MAX_TURNS = 8;
export const NOTES_PATH = "/root/notes.md";
const PLACEHOLDER_MODEL = "anthropic/claude-haiku-5.5";
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
  | { status: "done"; call: ToolCall | null; usage: UsageReading[] }
  | { status: "error"; message: string; usage: UsageReading[] };

const SANDBOX_SECTION = [
  "You have a private Linux sandbox with no network access. Use the `bash` tool to run short commands in it.",
  `Keep notes for yourself in ${NOTES_PATH} (e.g. \`echo '...' >> ${NOTES_PATH}\`, \`cat ${NOTES_PATH}\`); the file persists for the whole Match.`,
  "Act in the game only through the game tools. Call exactly one game tool per turn: the one the observation asks for.",
].join("\n");

/** Agent37 instance names: deterministic per seat, so a retried provision finds its own sandbox. */
export const INSTANCE_PREFIX = "wl-pi-";
export const instanceName = (matchId: string, seat: number) => `${INSTANCE_PREFIX}${matchId}-${seat}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60);

export class PiSeatDO extends DurableObject<Env> {
  private readonly harness: PiHarness;
  private readonly lifecycle: Lifecycle;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const models = createModels({
      authContext: { env: async (name: string) => (env as unknown as Record<string, string | undefined>)[name], fileExists: async () => false },
    } as Parameters<typeof createModels>[0]);
    models.setProvider(openrouterProvider());
    const stored = this.config;
    this.harness = new PiHarness({
      harness: ({ storage, context, onWake }) => {
        const registry = createRegistry();
        const config = this.config;
        if (config) registry.install(this.extension(config) as never);
        return Harness.open(storage, { models, registry, onWake } as never, context);
      },
      defaults: { model: { provider: "openrouter", id: stored?.model ?? PLACEHOLDER_MODEL }, maxTurns: PI_MAX_TURNS },
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
      instance = await this.agent37().create(instanceName(config.matchId, config.seat));
      this.ctx.storage.kv.put("instance", instance);
    }
    this.ctx.storage.kv.put("config", config);
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
    }
    this.turns.put({ opId, turnId, accepted: null });
    await this.harness.submit(text, { operationId: opId });
  }

  async poll(opId: string): Promise<PiPoll> {
    await this.lifecycle.start();
    const turn = this.turns.get();
    if (!turn || turn.opId !== opId || turn.cancelled) return { status: "error", message: `pi run ${opId} is no longer this seat's turn`, usage: [] };
    if (turn.accepted) return { status: "done", call: turn.accepted, usage: await this.usage() };
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
   * earlier ones). pi-ai's `input` excludes cache reads and its `output` includes reasoning.
   */
  private async usage(): Promise<UsageReading[]> {
    const config = this.config;
    if (!config) return [];
    const total: Usage = { input: 0, cached: 0, thought: 0, output: 0 };
    for (const entry of await this.harness.messages()) {
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
    return [{ id: `pi:${config.matchId}:${config.seat}`, model: config.model, usage: total }];
  }
}
