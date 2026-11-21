// Token usage as Harnesses and Narrators report it. Harness-agnostic: every
// implementation maps its API's usage fields onto `Usage`.

/** Tokens billed for one model call. `input` is the total input and includes `cached`. */
export interface Usage {
  input: number;
  cached: number;
  thought: number;
  output: number;
}

/**
 * One billed model call's usage. The same call may be read more than once (e.g.
 * on poll, on cancel and when the next turn starts); readings share its `id` and
 * the latest reading replaces earlier ones, so a call is never counted twice.
 */
export interface UsageReading {
  /** Stable ID of the billed call, e.g. the interaction ID. */
  id: string;
  /** Model the call was billed on (a key of the price table). */
  model: string;
  usage: Usage;
}

/** Token totals per model. */
export type ModelUsage = Record<string, Usage>;

export const ZERO_USAGE: Usage = { input: 0, cached: 0, thought: 0, output: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return { input: a.input + b.input, cached: a.cached + b.cached, thought: a.thought + b.thought, output: a.output + b.output };
}

const tokens = (u: Usage) => u.input + u.thought + u.output;

/** Every token count summed across models. */
export function totalUsage(m: ModelUsage): Usage {
  return Object.values(m).reduce(addUsage, ZERO_USAGE);
}

/** Add `b`'s per-model totals into `a`'s. */
export function mergeModelUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  const out: ModelUsage = { ...a };
  for (const [model, u] of Object.entries(b)) out[model] = addUsage(out[model] ?? ZERO_USAGE, u);
  return out;
}

/** True if `b` has counted at least as many tokens as `a` in total (usage only grows). */
export const atLeast = (b: ModelUsage, a: ModelUsage | undefined): boolean => !a || tokens(totalUsage(b)) >= tokens(totalUsage(a));

/** Readings keyed by call ID. A newer reading of the same call replaces the older one, field by field never shrinking. */
export type UsageLedger = Record<string, { model: string; usage: Usage }>;

export function recordReadings(ledger: UsageLedger, readings: UsageReading[] | undefined): UsageLedger {
  if (!readings?.length) return ledger;
  const next = { ...ledger };
  for (const r of readings) {
    const old = next[r.id]?.usage ?? ZERO_USAGE;
    const u = r.usage;
    next[r.id] = {
      model: r.model,
      usage: {
        input: Math.max(old.input, u.input),
        cached: Math.max(old.cached, u.cached),
        thought: Math.max(old.thought, u.thought),
        output: Math.max(old.output, u.output),
      },
    };
  }
  return next;
}

/** A ledger's token totals per model. */
export function ledgerUsage(ledger: UsageLedger): ModelUsage {
  const out: ModelUsage = {};
  for (const { model, usage } of Object.values(ledger)) out[model] = addUsage(out[model] ?? ZERO_USAGE, usage);
  return out;
}
