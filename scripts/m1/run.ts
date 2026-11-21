// M1 sanity check (ticket wl-ewd7). Usage, with GEMINI_API_KEY in the environment:
//   node --env-file=<.env> scripts/m1/run.ts chain <model> [env]          ~6-turn Seer chain, per-turn latency/tokens
//   node --env-file=<.env> scripts/m1/run.ts recover-continuation <model> path 1: cancel a continuation, answer parent later
//   node --env-file=<.env> scripts/m1/run.ts recover-first <model> [env]  path 2: cancel a first turn, fresh chain on same env
// Each run writes scripts/m1/results/<mode>-<model>[-tag].json (overwrites). Nothing here logs request headers.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Interaction, type PendingCall, SEER_TOOL_NAMES, cancel, continuationBody, create, firstTurnBody, get,
  pendingGameCall, poll, usage,
} from "./chain.ts";

const [mode, model, envArg] = process.argv.slice(2);
if (!mode || !model) throw new Error("usage: run.ts <chain|recover-continuation|recover-first> <model> [env]");
const TAG = process.env.M1_TAG ? `-${process.env.M1_TAG}` : "";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "results");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secs = (t0: number) => Math.round((performance.now() - t0) / 100) / 10;
const errMsg = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 400);

// ---------------------------------------------------------------- game script

const SEATS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const RULES = `You are playing Werewolf at an 8-seat table (P1-P8): 2 Werewolves, 1 Seer, 1 Doctor, 4 Villagers.
Each Night the Werewolves kill one player, the Seer inspects one player, the Doctor protects one player.
Each Day players speak in turn, then everyone votes to eliminate one player (or abstain); plurality is eliminated.
The Village wins when both Werewolves are dead; the Werewolves win when they equal the Village in number.

Agent Instructions: act only through the tools you are given. Each tool result contains the new events since your
last action and tells you which action the game expects next. Call exactly one tool per turn. Do not run code.
When you vote, give beliefs as your probability that each other living player is a Werewolf.

You are P3. Your role is Seer. Seats: ${SEATS.map((s) => (s === "P3" ? "P3 (you)" : s)).join(", ")}. All players are alive.
`;

// Deterministic synthetic discussion, ~1.5k tokens per chunk (same scale as FINDINGS 7b).
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}
const OPEN = ["I noticed", "Honestly", "Look,", "For the record,", "Let's be careful:"];
const VERB = ["defended", "accused", "stayed quiet about", "changed their story on", "agreed too quickly with"];
const WHY = ["which feels scripted", "and that timing is odd", "but their reasoning was solid", "which is what a wolf would do"];
function discussion(seed: number, day: number, alive: string[], n = 26): string {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const others = alive.filter((p) => p !== "P3");
  return Array.from({ length: n }, () => {
    const [a, b, c] = [pick(others), pick(alive), pick(alive)];
    return `Day ${day} | ${a}: ${pick(OPEN)} ${b} ${pick(VERB)} ${c}, ${pick(WHY)}. I'd put ${c} at ${5 + Math.floor(r() * 90)}% wolf.`;
  }).join("\n");
}
const ALIVE1 = SEATS.filter((s) => s !== "P8");
const ALIVE2 = ALIVE1.filter((s) => s !== "P6");

// Each entry: the observation sent inside the previous action's function_result, and the action the game expects.
type Turn = { expect: string; observation: Record<string, unknown> };
const TURNS: Turn[] = [
  { expect: "inspect", observation: {} }, // first turn: prompt is RULES + "Night 1"
  { expect: "speak", observation: {
    inspect_result: "SEER_RESULT", night: "P8 was killed in the night (P8 was a Villager).",
    new_events: discussion(1, 1, ALIVE1), next: "Day 1: your turn to speak. Call speak." } },
  { expect: "vote", observation: {
    new_events: discussion(2, 1, ALIVE1), next: "Day 1 discussion is over. Call vote." } },
  { expect: "inspect", observation: {
    vote_result: "P6 was eliminated (votes: P6 x4, P2 x2, abstain x1). P6 was a Villager.",
    next: "Night 2: choose a player to inspect. Call inspect." } },
  { expect: "speak", observation: {
    inspect_result: "SEER_RESULT", night: "Nobody died in the night.",
    new_events: discussion(3, 2, ALIVE2), next: "Day 2: your turn to speak. Call speak." } },
  { expect: "vote", observation: {
    new_events: discussion(4, 2, ALIVE2), next: "Day 2 discussion is over. Call vote." } },
];
const WOLVES = new Set(["P2", "P5"]);
const firstPrompt = RULES + "\nNight 1: choose a player to inspect. Call inspect.";

function resultFor(prev: PendingCall, turn: Turn): Record<string, unknown> {
  const obs = { ...turn.observation };
  if (obs.inspect_result === "SEER_RESULT") {
    const t = prev.arguments?.target;
    obs.inspect_result = `${t} is ${WOLVES.has(t) ? "a Werewolf" : "not a Werewolf"}.`;
  }
  return { accepted: true, ...obs };
}

// ---------------------------------------------------------------- measured turn

type Row = Record<string, unknown>;
async function turn(label: string, body: any): Promise<{ it: Interaction; row: Row; pending: PendingCall | null }> {
  const t0 = performance.now();
  const created = await create(body);
  const createS = secs(t0);
  const it = await poll(created.id, t0);
  const pending = pendingGameCall(it.steps ?? [], SEER_TOOL_NAMES);
  const row: Row = {
    turn: label, id: it.id, status: it.status, create_s: createS, total_s: secs(t0),
    env: it.environment_id, steps: (it.steps ?? []).map((s) => s.type + (s.name ? `:${s.name}` : "")),
    call: pending ? { name: pending.name, arguments: pending.arguments } : null, usage: usage(it),
  };
  const u = row.usage as any;
  console.log(JSON.stringify({ turn: label, status: it.status, create_s: createS, total_s: row.total_s,
    call: pending?.name, in: u.input, cached: u.cached, thought: u.thought, out: u.output }));
  return { it, row, pending };
}

function save(name: string, data: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}-${model}${TAG}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", file);
}

function beliefSum(call: PendingCall | null) {
  if (call?.name !== "vote") return undefined;
  return Object.values(call.arguments?.beliefs ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
}

/** Cancel an in-flight interaction, recording the status seen before and after. Never throws. */
async function cancelAndObserve(id: string) {
  const out: Row = { id };
  try { out.status_before_cancel = (await get(id)).status; } catch (e) { out.get_before_error = errMsg(e); }
  try { out.cancel_response_status = (await cancel(id)).status; } catch (e) { out.cancel_error = errMsg(e); }
  await sleep(2000);
  try {
    const after = await get(id);
    out.status_after = after.status;
    out.env_after = after.environment_id;
    out.steps_after = (after.steps ?? []).map((s) => s.type);
  } catch (e) { out.get_after_error = errMsg(e); }
  return out;
}

// ---------------------------------------------------------------- modes

async function chain() {
  const rows: Row[] = [];
  try {
    let { it, row, pending } = await turn("0", firstTurnBody(model, envArg ?? "remote", firstPrompt));
    rows.push({ ...row, expect: TURNS[0].expect, valid: pending?.name === TURNS[0].expect });
    for (let i = 1; i < TURNS.length && pending; i++) {
      const r = await turn(String(i), continuationBody(model, it, pending, resultFor(pending, TURNS[i])));
      rows.push({ ...r.row, expect: TURNS[i].expect, valid: r.pending?.name === TURNS[i].expect,
        belief_sum: beliefSum(r.pending) });
      ({ it, pending } = r);
    }
  } catch (e) {
    rows.push({ error: errMsg(e) });
    throw e;
  } finally {
    save("chain", { model, max_total_tokens: 100000, env_source: envArg ? "existing" : "fresh remote", rows });
  }
}

async function recoverContinuation() {
  const out: Row = { model };
  try {
    // Parent: a real first turn paused in requires_action.
    const p = await turn("parent", firstTurnBody(model, envArg ?? "remote", firstPrompt));
    out.parent = p.row;
    if (!p.pending) throw new Error("parent did not pause on a game call");
    // Continuation C1 with the Day 1 observation, cancelled shortly after create.
    const c1 = await create(continuationBody(model, p.it, p.pending, resultFor(p.pending, TURNS[1])));
    await sleep(1500);
    out.cancelled = await cancelAndObserve(c1.id);
    out.parent_status_after_cancel = (await get(p.it.id)).status;
    console.log(JSON.stringify({ cancelled: out.cancelled, parent: out.parent_status_after_cancel }));
    // Later: answer the same pending call from the same parent, with newer observations.
    await sleep(10_000);
    const later = { ...resultFor(p.pending, TURNS[1]), new_events: discussion(9, 1, ALIVE1),
      note: "Your previous turn timed out; this result replaces it." };
    try {
      const c2 = await turn("retry", continuationBody(model, p.it, p.pending, later));
      out.retry = c2.row;
      if (c2.pending) {
        out.after_retry = (await turn("after-retry",
          continuationBody(model, c2.it, c2.pending, resultFor(c2.pending, TURNS[2])))).row;
      }
      out.confirmed = (out.cancelled as Row).status_after === "cancelled"
        && c2.it.status === "requires_action" && !!c2.pending;
    } catch (e) {
      out.retry_error = errMsg(e);
      out.confirmed = false;
    }
  } finally {
    save("recover-continuation", out);
  }
}

async function recoverFirst() {
  // A first turn (no parent), cancelled shortly after create. envArg = existing environment, else fresh "remote".
  const out: Row = { model, env_source: envArg ? "existing" : "fresh remote" };
  try {
    const t0 = performance.now();
    const f1 = await create(firstTurnBody(model, envArg ?? "remote", firstPrompt));
    out.create_s = secs(t0);
    out.env_on_create = f1.environment_id;
    out.status_on_create = f1.status;
    await sleep(1500);
    out.cancelled = await cancelAndObserve(f1.id);
    console.log(JSON.stringify(out));
    const env = envArg ?? ((out.cancelled as Row).env_after as string | undefined) ?? f1.environment_id;
    if (!env) {
      out.confirmed = false;
      out.finding = "cancelled first turn exposes no environment_id; a fresh chain cannot target it";
      return;
    }
    try {
      const fresh = await turn("fresh-0", firstTurnBody(model, env, firstPrompt));
      out.fresh = fresh.row;
      if (fresh.pending) {
        out.next = (await turn("fresh-1", continuationBody(model, fresh.it, fresh.pending,
          resultFor(fresh.pending, TURNS[1])))).row;
      }
      out.same_env = fresh.it.environment_id === env;
      out.confirmed = (out.cancelled as Row).status_after === "cancelled"
        && fresh.it.status === "requires_action" && out.same_env;
    } catch (e) {
      out.fresh_error = errMsg(e);
      out.confirmed = false;
    }
  } finally {
    save(envArg ? "recover-first-existing-env" : "recover-first", out);
  }
}

const modes: Record<string, () => Promise<void>> = {
  chain, "recover-continuation": recoverContinuation, "recover-first": recoverFirst,
};
await modes[mode]();
