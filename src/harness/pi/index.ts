// pi Harness adapter: plays a seat through Pi Durable in a dedicated PiSeatDO (./seat.ts),
// driven over RPC (ADR-0003). Each Player turn is one Pi run carrying the observation.
// The run's operation id is a per-seat turn counter kept in `chain`, so an alarm retry of
// startTurn resubmits the same id (a no-op in Pi) and a new turn always gets a fresh one.
// An invalid call is already retried inside the run (the Match's error comes back as the
// tool result); if one still reaches submitAction, the retry is a new run carrying the error.

import type { Harness, PlayerContext, PollResult, TurnHandle } from "../../core/harness";
import type { PiPoll, PiSeatConfig } from "./seat";
import type { UsageReading } from "../../core/usage";
import { Agent37, type Fetch } from "./agent37";
import { INSTANCE_PREFIX } from "./seat-name";

export const PI_HARNESS_ID = "pi";

/** What the adapter needs from a seat's PiSeatDO (a stub in tests). */
export interface PiSeatClient {
  provision(config: PiSeatConfig): Promise<{ instance: string }>;
  startTurn(opId: string, turnId: string, text: string): Promise<void>;
  poll(opId: string): Promise<PiPoll>;
  cancel(opId: string): Promise<{ usage: UsageReading[] }>;
  close(): Promise<{ usage: UsageReading[]; deleted: boolean }>;
}

export type SeatResolver = (ctx: PlayerContext) => PiSeatClient;

const withUsage = (usage: UsageReading[] | undefined) => (usage?.length ? { usage } : {});

export function piHarness(seatFor: SeatResolver): Harness {
  return {
    async provision(ctx) {
      if (!ctx.agent.model) throw new Error(`pi agent ${ctx.agent.id} has no model`);
      if (ctx.tools.length === 0) throw new Error(`seat ${ctx.seat} has no tools`);
      const { instance } = await seatFor(ctx).provision({
        matchId: ctx.matchId,
        seat: ctx.seat,
        model: ctx.agent.model,
        tools: ctx.tools,
        ...(ctx.instructions ? { instructions: ctx.instructions } : {}),
      });
      return { ...ctx.chain, instance, turns: 0 };
    },

    async startTurn(ctx, input) {
      const turns = Number(ctx.chain.turns ?? 0) + 1;
      const opId = `turn-${turns}`;
      if (!input.turnId) throw new Error("pi harness needs the turn ID to check calls with the Match");
      const turnId = input.turnId;
      const text = input.error ? `${input.text}\n\nYour last call was rejected: ${input.error}` : input.text;
      await seatFor(ctx).startTurn(opId, turnId, text);
      return { handle: { opId }, chain: { ...ctx.chain, turns } };
    },

    async poll(ctx, handle: TurnHandle): Promise<PollResult> {
      const r = await seatFor(ctx).poll(String(handle.opId));
      if (r.status === "pending") return { status: "pending", handle };
      if (r.status === "done") return { status: "done", call: r.call, ...withUsage(r.usage), ...(r.notes ? { notes: r.notes } : {}) };
      return { status: "error", message: r.message, ...withUsage(r.usage) };
    },

    async cancel(ctx, handle) {
      const r = await seatFor(ctx).cancel(String(handle.opId));
      return withUsage(r.usage);
    },

    async close(ctx) {
      // Never blocks the Match: a failed delete is left for the pause sweep.
      const r = await seatFor(ctx)
        .close()
        .catch(() => ({ usage: [] as UsageReading[], deleted: false }));
      return { chain: { ...ctx.chain, closed: true, sandboxDeleted: r.deleted }, ...withUsage(r.usage) };
    },
  };
}

/** The production resolver: one PiSeatDO per Player, named like the Player DO. */
export function piSeatsFrom(env: Env): SeatResolver {
  return (ctx) => env.PI_SEAT.getByName(`${ctx.matchId}:${ctx.seat}`) as unknown as PiSeatClient;
}

/** A sandbox older than this outlived any Match (the longest run ~45 min), so its delete at Match end failed. */
export const SWEEP_AGE_MS = 2 * 60 * 60_000;

/**
 * Best-effort cleanup on League pause: delete pi sandboxes left over from Matches whose
 * close-time delete failed. Never throws; returns how many it deleted.
 */
export async function sweepSandboxes(apiKey: string | undefined, now = Date.now(), fetchFn?: Fetch): Promise<number> {
  if (!apiKey) return 0;
  try {
    const api = new Agent37(apiKey, fetchFn);
    const stale = (await api.list(INSTANCE_PREFIX)).filter((i) => i.created !== undefined && now - i.created * 1000 > SWEEP_AGE_MS);
    const done = await Promise.allSettled(stale.map((i) => api.delete(i.id)));
    return done.filter((d) => d.status === "fulfilled").length;
  } catch (err) {
    console.warn(`pi sandbox sweep failed: ${String(err)}`);
    return 0;
  }
}
