// Manual smoke test of the gemini-decision-1 Narrator against the real Decisions
// API (never run in tests or CI). Plays a scripted Werewolf Match through the
// pure Ruleset, and after a few steps sends its God View log to the Narrator,
// printing latency, Drama Score and flag values.
//
//   GEMINI_API_KEY=... (from .dev.vars) then:
//   node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild scripts/smoke-narrator.ts --bundle --platform=node --format=esm --outfile=/tmp/smoke-narrator.mjs
//   node /tmp/smoke-narrator.mjs

import { DEFAULT_DRAMA_THRESHOLD, type NarrationInput } from "../src/core/narrator";
import type { ToolCall } from "../src/core/ruleset";
import { decisionsNarrator } from "../src/narrator/decisions";
import { werewolf } from "../src/rulesets/werewolf";
import type { RulesetEvent } from "../src/shared/protocol";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("set GEMINI_API_KEY");

const seats = Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, agentId: `a${i + 1}`, label: `Agent ${i + 1}` }));
const setup = werewolf.setup({}, "narrator-smoke", seats);
if (!setup.ok) throw new Error(setup.error);
let state = setup.state;
const log: RulesetEvent[] = [...setup.events];
const narrator = decisionsNarrator({ apiKey });
const hook = werewolf.narration!;

// Everyone claims Seer and accuses the next seat: a claim war on Day 1.
function act(seat: number, kind: string, targets: (number | string)[]): ToolCall {
  if (kind === "speak") {
    const next = (seat % 7) + 1;
    return { name: "speak", args: { text: `I am the Seer. Seat ${next} is a Werewolf, I checked them.`, accuse: [next], claim: { role: "seer" } } };
  }
  if (kind === "wolf_chat") return { name: "wolf_chat", args: { text: seat % 2 ? "Kill seat 3." : "No, kill seat 5, it's safer." } };
  if (kind === "vote") return { name: "vote", args: { target: targets[0], beliefs: {}, reason: "they are lying about Seer" } };
  return { name: kind, args: { target: targets[0] } };
}

for (let step = 1; step <= 8; step++) {
  const next = werewolf.nextStep(state);
  if (next.type === "finished") break;
  const actions = Object.fromEntries(next.turns.map((t) => [t.seat, act(t.seat, t.actionKind, t.legalTargets)]));
  const r = werewolf.applyActions(state, actions);
  state = r.state;
  log.push(...r.events);
  if (step % 3 !== 0 && step !== 8) continue;
  const input: NarrationInput = { matchId: "smoke", log: hook.log(state, log), questions: hook.questions };
  const t0 = performance.now();
  try {
    const n = await narrator.narrate(input, AbortSignal.timeout(5000));
    const ms = Math.round(performance.now() - t0);
    const flags = n.flags.map((f) => `${f.id}=${f.value.toFixed(2)}${f.value >= DEFAULT_DRAMA_THRESHOLD ? "*" : ""}`).join(" ");
    console.log(`step ${step}: ${ms} ms, ${input.log.length} chars, drama ${n.dramaScore.toFixed(2)} | ${flags}`);
  } catch (e) {
    console.log(`step ${step}: failed after ${Math.round(performance.now() - t0)} ms: ${(e as Error).message}`);
  }
}
