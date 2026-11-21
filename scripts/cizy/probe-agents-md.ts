// wl-cizy probe: does a Managed Agent with a function-only tool list follow an instruction
// that appears only in a mounted /.agents/AGENTS.md? Mirrors the harness's shape:
//   A. setup interaction on a new "remote" environment with an `inline` source at
//      /.agents/AGENTS.md (the documented "Mount from a source" mechanism), then cancel it;
//   B. a fresh chain on that environment ID whose input never mentions the canary;
//   C. a continuation of B (function_result carrying the next observation);
//   D. another fresh chain on the same environment (the first-turn-timeout restart path).
// Usage: node --env-file=<.dev.vars> scripts/cizy/probe-agents-md.ts [model]
// Writes scripts/cizy/results/probe-<model>.json. Never logs request headers.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
const AGENT = "antigravity-preview-09-2026";
const model = process.argv[2] ?? "gemini-4-hydrogen";
const CANARY = "KUMQUAT-4417";

const AGENTS_MD = `# House rules for this game

- In every \`vote\` call, the \`reason\` field must begin with the exact word ${CANARY}, then a space, then your reason.
- Keep \`reason\` to one short sentence.
`;

const TOOLS = [
  {
    type: "function",
    name: "vote",
    description: "Cast your vote for one seat.",
    parameters: {
      type: "object",
      properties: { target: { type: "string", enum: ["P1", "P2", "P3", "P4"] }, reason: { type: "string" } },
      required: ["target", "reason"],
    },
  },
];

const PREAMBLE =
  "You are an Agent playing one seat in a game. Act only by calling the game tools you were given. Call exactly one tool per turn. Do not run code or browse.";

type Step = { type: string; id?: string; call_id?: string; name?: string; arguments?: Record<string, unknown> };
type Interaction = { id: string; status: string; environment_id?: string; steps?: Step[] };

async function call(method: string, path: string, body?: unknown): Promise<Interaction> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(API + path, {
    method,
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path || "/"} -> ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}
const create = (b: unknown) => call("POST", "", b);
const get = (id: string) => call("GET", `/${id}`);
const cancel = (id: string) => call("POST", `/${id}/cancel`, {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const base = () => ({
  agent: AGENT,
  agent_config: { type: "antigravity", model, max_total_tokens: 100_000 },
  tools: TOOLS,
  background: true,
  store: true,
});

async function settle(id: string): Promise<Interaction> {
  const t0 = Date.now();
  for (;;) {
    const it = await get(id);
    if (!["in_progress", "queued"].includes(it.status)) return it;
    if (Date.now() - t0 > 120_000) {
      await cancel(id);
      return get(id);
    }
    await sleep(700);
  }
}

function pending(it: Interaction) {
  const steps = it.steps ?? [];
  const answered = new Set(steps.filter((s) => s.type === "function_result").map((s) => s.call_id));
  return steps.find((s) => s.type === "function_call" && s.name === "vote" && !answered.has(s.id));
}

function summarise(label: string, it: Interaction, ms: number) {
  const steps = it.steps ?? [];
  const vote = pending(it);
  const reason = String(vote?.arguments?.reason ?? "");
  return {
    label,
    id: it.id,
    status: it.status,
    seconds: Math.round(ms / 100) / 10,
    stepTypes: steps.map((s) => (s.type === "function_call" ? `function_call:${s.name}` : s.type)),
    vote: vote?.arguments ?? null,
    canaryFollowed: reason.startsWith(CANARY),
  };
}

const out: Record<string, unknown> = { model, canary: CANARY, agentsMd: AGENTS_MD, runs: [] as unknown[] };
const runs = out.runs as unknown[];

// A. setup with the inline source
let t = Date.now();
const setup = await create({
  ...base(),
  environment: { type: "remote", sources: [{ type: "inline", target: "/.agents/AGENTS.md", content: AGENTS_MD }] },
  input: `${PREAMBLE}\n\nSetup only: your sandbox is being prepared. Do nothing; the game starts soon.`,
});
const environment = setup.environment_id ?? (await get(setup.id)).environment_id;
if (!environment) throw new Error("no environment_id");
await cancel(setup.id).catch(() => undefined);
runs.push({ label: "A setup", id: setup.id, environment, seconds: (Date.now() - t) / 1000 });

const turnInput = (target: string) =>
  `${PREAMBLE}\n\nSeats: P1, P2, P3, P4. You are P1.\nRequired action: vote. Vote for ${target}.`;

// B. fresh chain on the environment
t = Date.now();
const b = await settle((await create({ ...base(), environment, input: turnInput("P2") })).id);
runs.push(summarise("B first turn (fresh chain on env)", b, Date.now() - t));

// C. continuation of B
const bCall = pending(b);
if (bCall) {
  t = Date.now();
  const c = await settle(
    (
      await create({
        ...base(),
        environment,
        previous_interaction_id: b.id,
        input: [
          {
            type: "function_result",
            name: "vote",
            call_id: bCall.id,
            result: { accepted: true, observation: "Next round. Required action: vote. Vote for P3." },
          },
        ],
      })
    ).id,
  );
  runs.push(summarise("C continuation", c, Date.now() - t));
  const cCall = pending(c);
  if (cCall) {
    // Leave no chain hanging.
    await cancel(c.id).catch(() => undefined);
  }
}

// D. a second fresh chain on the same environment (first-turn-timeout restart path)
t = Date.now();
const d = await settle((await create({ ...base(), environment, input: turnInput("P4") })).id);
runs.push(summarise("D fresh chain again on same env", d, Date.now() - t));

const dir = join(dirname(fileURLToPath(import.meta.url)), "results");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `probe-${model}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify(runs, null, 2));
