// @ts-nocheck
// PROTOTYPE — throwaway spike for wl-zst1 (branch prototype/pi-spike). Not production code.
// Answers: can PiHarness run in a DO with an OpenRouter model, record a `speak` call through a
// ToolRegistration validated by the real Ruleset, and can the Worker drive an Agent37 instance?
// Run: pnpm exec wrangler dev -c prototypes/pi-spike/wrangler.jsonc --port 8799 --persist-to .wrangler/pi-spike-state
//   curl "localhost:8799/spike/turn?rejectFirst=1"   curl 'localhost:8799/spike/agent37'

import { DurableObject } from "cloudflare:workers";
import { Lifecycle } from "agents/lifecycle";
import { PiHarness } from "agents/harness/pi";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { createModels } from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { werewolf } from "../../src/rulesets/werewolf";
import { nightKill, seatsOf } from "../../test/werewolf/helpers";

// Edit to switch models: ?model= does not work (a session's model is fixed at DO construction, before setup()).
// Tried: deepseek/deepseek-v4.1-flash (ok), anthropic/claude-haiku-5.5, google/gemini-2.5-flash-lite (404 upstream).
const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";
const SEAT = 1;

/** A Day 1 Speech Round A state for a 7-seat table, plus seat 1's real tools and observation. */
function dayOneSeat(seed: string) {
  const r = werewolf.setup({}, seed, seatsOf(7));
  if (!r.ok) throw new Error(r.error);
  const night = nightKill(r.state, null);
  const state = night.state;
  const step = werewolf.nextStep(state);
  const turn = step.turns.find((t) => t.seat === SEAT);
  const events = werewolf.view([...r.events, ...night.events], { seat: SEAT });
  const observation = werewolf.renderObservation(state, SEAT, events, turn);
  return { state, turn, tools: r.tools[SEAT], briefing: werewolf.briefing(state, SEAT), observation };
}

export class PiSeatDO extends DurableObject {
  registry = createRegistry();
  models = createModels({
    authContext: { env: async (name) => this.env[name], fileExists: async () => false },
  });
  harness: PiHarness;
  lifecycle: Lifecycle;

  constructor(ctx, env) {
    super(ctx, env);
    this.models.setProvider(openrouterProvider());
    const model = ctx.storage.kv.get("model") ?? DEFAULT_MODEL;
    this.harness = new PiHarness({
      harness: ({ storage, context, onWake }) => {
        this.installGame();
        return Harness.open(storage, { models: this.models, registry: this.registry, onWake }, context);
      },
      defaults: { model: { provider: "openrouter", id: model }, maxTurns: 4 },
    });
    this.lifecycle = Lifecycle.install(this).use(this.harness);
  }

  private log(entry) {
    const calls = this.ctx.storage.kv.get("calls") ?? [];
    calls.push({ at: Date.now(), ...entry });
    this.ctx.storage.kv.put("calls", calls);
  }

  /** The seat's fixed tool list as Pi ToolRegistrations; execute() validates through the Ruleset. */
  private installGame() {
    const game = this.ctx.storage.kv.get("game");
    if (!game) return;
    const tools = game.tools.map((spec) => ({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      async execute(args) {
        return self.onToolCall(spec.name, args);
      },
    }));
    const self = this;
    this.registry.install({
      name: "werewolf.seat",
      tools,
      sections: [{ key: "agent_instructions", render: () => game.briefing }],
    });
  }

  onToolCall(name, args) {
    const game = this.ctx.storage.kv.get("game");
    const call = { name, args };
    if (this.ctx.storage.kv.get("accepted")) {
      this.log({ name, args, outcome: "ignored (turn already ended)" });
      return { output: [{ type: "text", text: "Ignored: your turn has already ended." }], control: { terminate: true } };
    }
    let v = werewolf.validate(game.state, SEAT, call);
    if (v.ok && game.rejectFirst && !this.ctx.storage.kv.get("rejectedOnce")) {
      this.ctx.storage.kv.put("rejectedOnce", true);
      v = { ok: false, error: `Spike: first call rejected on purpose. ${game.turn.prompt}` };
    }
    if (!v.ok) {
      this.log({ name, args, outcome: "invalid", error: v.error });
      return { output: [{ type: "text", text: v.error }], isError: true };
    }
    this.ctx.storage.kv.put("accepted", { call, at: Date.now() });
    this.log({ name, args, outcome: "accepted" });
    return { output: [{ type: "text", text: "Recorded. Your turn is over." }], control: { terminate: true } };
  }

  async setup({ seed, model, rejectFirst }) {
    const g = dayOneSeat(seed);
    this.ctx.storage.kv.put("model", model);
    this.ctx.storage.kv.put("game", { ...g, rejectFirst });
    this.installGame();
    return { observation: g.observation, tools: g.tools.map((t) => t.name), turn: g.turn };
  }

  async startTurn() {
    await this.lifecycle.start();
    const game = this.ctx.storage.kv.get("game");
    const t0 = Date.now();
    const receipt = await this.harness.submit(game.observation, { operationId: "turn-1" });
    this.ctx.storage.kv.put("startedAt", t0);
    return { receipt, submitMs: Date.now() - t0 };
  }

  async poll() {
    await this.lifecycle.start();
    return {
      accepted: this.ctx.storage.kv.get("accepted") ?? null,
      pending: await this.harness.pending(),
      startedAt: this.ctx.storage.kv.get("startedAt"),
    };
  }

  async finish() {
    await this.lifecycle.start();
    const result = await this.harness.wait("turn-1");
    const messages = await this.harness.messages();
    return {
      result,
      calls: this.ctx.storage.kv.get("calls") ?? [],
      transcript: messages.map((m) => {
        const s = JSON.stringify(m.data ?? m);
        return { kind: m.kind, data: s.slice(0, 400), error: s.match(/"errorMessage":"(.{0,800})/)?.[1] };
      }),
    };
  }
}

async function turnSpike(env, url) {
  const name = `seat-${Date.now()}`;
  const model = url.searchParams.get("model") ?? DEFAULT_MODEL;
  const seat = env.PI_SEAT.getByName(name);
  const setup = await seat.setup({ seed: "spike", model, rejectFirst: url.searchParams.get("rejectFirst") === "1" });
  const started = await seat.startTurn();
  const t0 = started.receipt && Date.now();
  let polled;
  for (let i = 0; i < 180; i++) {
    polled = await seat.poll();
    if (polled.accepted || (polled.pending.length === 0 && i > 0)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const acceptedMs = polled.accepted ? polled.accepted.at - polled.startedAt : null;
  const fin = await seat.finish();
  return {
    name, model, setup: { tools: setup.tools, observationChars: setup.observation.length, turnPrompt: setup.turn.prompt },
    started, acceptedMs, settledMs: Date.now() - polled.startedAt, accepted: polled.accepted, ...fin,
  };
}

async function agent37Spike(env) {
  const api = "https://api.agent37.com/v1";
  const bearer = { authorization: `Bearer ${env.AGENT37_API_KEY}`, "content-type": "application/json" };
  const out = { timings: {} };
  const time = async (label, fn) => {
    const t = Date.now();
    try { return await fn(); } finally { out.timings[label] = Date.now() - t; }
  };
  const tag = `wl-pi-spike-${Date.now()}`;
  let id;
  try {
    const created = await time("create", async () => {
      const res = await fetch(`${api}/instances`, {
        method: "POST", headers: bearer,
        body: JSON.stringify({ name: tag, template: "agent37-base", resources: { cpu: 2, memory: 4, disk: 2 }, network: "deny-all" }),
      });
      return { status: res.status, body: await res.json() };
    });
    id = created.body?.id;
    out.created = { status: created.status, id, state: created.body?.status, network: created.body?.network, error: created.body?.error };
    console.log("agent37 instance created", id);
    if (!id) return out;
    const exec = (command) => fetch(`https://sandbox.agent37.app/v1/instances/${id}/exec`, {
      method: "POST", headers: { "x-agent37-key": env.AGENT37_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ command }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    out.exec = await time("exec", () => exec("echo hello-from-agent37 && uname -sm && echo note-1 >> /tmp/notes.md && cat /tmp/notes.md"));
    out.exec2 = await time("exec2", () => exec("echo again"));
    out.egress = await time("egress", () => exec("(command -v curl && curl -sS -m 5 -o /dev/null -w '%{http_code}' https://example.com) || (command -v wget && wget -q -T 5 -O /dev/null https://example.com && echo ok) || getent hosts example.com || echo EGRESS_BLOCKED"));
  } finally {
    if (id) {
      out.deleted = await time("delete", async () => {
        const res = await fetch(`${api}/instances/${id}`, { method: "DELETE", headers: bearer });
        return { status: res.status, body: await res.json() };
      });
    }
    const list = await fetch(`${api}/instances`, { headers: bearer }).then((r) => r.json());
    out.leftovers = (list.data ?? []).filter((i) => String(i.name ?? "").startsWith("wl-pi-spike")).map((i) => ({ id: i.id, status: i.status }));
  }
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/spike/turn") return Response.json(await turnSpike(env, url));
      if (url.pathname === "/spike/agent37") return Response.json(await agent37Spike(env));
      return new Response("PROTOTYPE: /spike/turn[?rejectFirst=1&model=...] or /spike/agent37\n");
    } catch (e) {
      return Response.json({ error: String(e?.stack ?? e) }, { status: 500 });
    }
  },
};
