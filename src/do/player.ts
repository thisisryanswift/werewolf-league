// Player DO: one per seat per Match. Owns the seat's Harness chain, runs each
// turn in the background, polls on its own alarm, enforces the turn's deadline
// and reports the action (or a timeout) to the Match DO.

import { DurableObject } from "cloudflare:workers";
import { nextPollDelay } from "../core/deadlines";
import { isRateLimited, type AgentConfig, type PlayerContext, type TurnHandle, type UsageReading } from "../core/harness";
import type { TurnAssignment } from "../core/match";
import { LEAGUE_NAME } from "../core/roster";
import type { Seat, ToolCall, ToolSpec } from "../core/ruleset";
import { ledgerUsage, recordReadings, type ModelUsage, type UsageLedger } from "../core/usage";
import { harnessFor } from "../harness";

interface Seating {
  matchId: string;
  seat: Seat;
  agent: AgentConfig;
  tools: ToolSpec[];
  /** Assembled Agent Instructions for this seat (see PlayerContext). */
  instructions?: string;
  /** See PlayerContext.preamble. */
  preamble?: string;
  /** The League the Match reports to (429s go there too); absent means LEAGUE_NAME. */
  league?: string;
}

interface CurrentTurn extends TurnAssignment {
  /** Harness handle once the turn has started; persisted before anything else. */
  handle: TurnHandle | null;
  attempts: number;
}

/**
 * A Player reports 429s to the League at most this often. Every report renews
 * the League's backoff, so sustained 429s keep it backing off; the throttle only
 * bounds the RPCs (the backoff is far longer than this).
 */
export const RATE_LIMIT_REPORT_MS = 2_000;

export class PlayerDO extends DurableObject<Env> {
  private get pollMs(): number {
    return Number(this.env.PLAYER_POLL_MS ?? 1000);
  }

  private context(seating: Seating): PlayerContext {
    return { ...seating, chain: this.ctx.storage.kv.get<Record<string, unknown>>("chain") ?? {} };
  }

  /**
   * Record usage readings in the seat's ledger (by call ID, so a call read twice
   * counts once). Synchronous, and done before anything else is awaited.
   */
  private collect(readings: UsageReading[] | undefined): void {
    if (!readings?.length) return;
    this.ctx.storage.kv.put("usage", recordReadings(this.ctx.storage.kv.get<UsageLedger>("usage") ?? {}, readings));
  }

  /** Every token this seat has been billed so far, per model. Sent with each report. */
  private get usage(): ModelUsage {
    return ledgerUsage(this.ctx.storage.kv.get<UsageLedger>("usage") ?? {});
  }

  private get turn(): CurrentTurn | undefined {
    return this.ctx.storage.kv.get<CurrentTurn>("turn");
  }

  /**
   * Write `next` (or clear the turn) only if `turnId` is still the current turn.
   * A new turn from the Match can arrive while the alarm awaits the Harness or
   * the Match; this stops the old alarm from overwriting it.
   */
  private updateTurn(turnId: string, next: CurrentTurn | null): boolean {
    if (this.turn?.turnId !== turnId) return false;
    if (next) this.ctx.storage.kv.put<CurrentTurn>("turn", next);
    else this.ctx.storage.kv.delete("turn");
    return true;
  }

  /**
   * Called by the Match at start: provision the Harness environment, then remember
   * the seat. The seat is only recorded after provisioning succeeds, so a failed
   * start can be retried. Re-provisioning the same Agent is a no-op.
   */
  async provision(seating: Seating): Promise<void> {
    const existing = this.ctx.storage.kv.get<Seating>("seating");
    if (existing && JSON.stringify(existing) === JSON.stringify(seating)) return;
    const harness = harnessFor(seating.agent, this.env);
    const chain = await harness.provision({ ...seating, chain: {} }).catch(async (err: unknown) => {
      // Reported before the failure reaches the League's start, so the League is already backing off.
      if (isRateLimited(err)) await this.reportRateLimit(seating, "provision");
      throw err;
    });
    this.ctx.storage.kv.put("chain", chain);
    this.ctx.storage.kv.put("seating", seating);
  }

  /**
   * Called by the Match: take a turn. Returns at once; the work runs on the alarm.
   * Re-sending the current turn is a no-op; a new turn replaces one still in flight.
   */
  async takeTurn(assignment: TurnAssignment): Promise<void> {
    const current = this.turn;
    if (current?.turnId === assignment.turnId) return;
    this.ctx.storage.kv.put<CurrentTurn>("turn", { ...assignment, handle: null, attempts: 0 });
    await this.ctx.storage.setAlarm(Date.now());
    if (current?.handle) await this.cancelAndReport(current.matchId, current.handle);
  }

  /**
   * Called by the Match when it gives up on the current turn without a successor (the
   * Analyst's backstop): drop the turn and cancel it if it is in flight. Idempotent.
   */
  async abandon(): Promise<void> {
    const turn = this.turn;
    if (!turn) return;
    this.ctx.storage.kv.delete("turn");
    if (turn.handle) await this.cancelAndReport(turn.matchId, turn.handle);
  }

  /**
   * Called by the Match when it is over: let the Harness settle anything still billed
   * (e.g. the setup interaction of a seat that never acted) and report the seat's usage.
   */
  async close(): Promise<void> {
    const seating = this.ctx.storage.kv.get<Seating>("seating");
    if (!seating || this.ctx.storage.kv.get<boolean>("closed")) return;
    const harness = harnessFor(seating.agent, this.env);
    const r = await harness.close?.(this.context(seating));
    this.collect(r?.usage);
    if (r?.chain) this.ctx.storage.kv.put("chain", r.chain);
    // Report before marking closed, so a failed report makes the Match retry the close.
    if (r?.usage?.length) await this.env.MATCH.getByName(seating.matchId).recordUsage(seating.seat, this.usage);
    this.ctx.storage.kv.put("closed", true);
  }

  async alarm(): Promise<void> {
    const seating = this.ctx.storage.kv.get<Seating>("seating");
    const turn = this.turn;
    if (!seating || !turn) return;
    if (Date.now() >= turn.deadlineAt) return this.timeOut(turn);
    const harness = harnessFor(seating.agent, this.env);
    const ctx = this.context(seating);

    if (!turn.handle) {
      const started = await harness.startTurn(ctx, turn.input).catch((err: unknown) => {
        // Rethrown: the alarm retries the same turn.
        if (isRateLimited(err)) this.reportRateLimit(seating, "startTurn");
        throw err;
      });
      this.collect(started.usage);
      this.ctx.storage.kv.put("chain", started.chain);
      if (!this.updateTurn(turn.turnId, { ...turn, handle: started.handle, attempts: turn.attempts + 1 })) {
        return this.superseded(started.handle);
      }
      return this.sleep(turn);
    }

    const polled = await harness.poll(ctx, turn.handle);
    if (polled.status !== "pending") this.collect(polled.usage);
    if (polled.status === "pending") {
      if (polled.rateLimited) this.reportRateLimit(seating, "poll");
      if (!this.updateTurn(turn.turnId, { ...turn, handle: polled.handle })) return this.superseded();
      return this.sleep(turn, polled.retryAfterMs);
    }
    // An answer that lands after the deadline is too late and counts as a timeout.
    if (Date.now() >= turn.deadlineAt) return this.timeOut(turn);
    const call: ToolCall | null = polled.status === "done" ? polled.call : null;
    await this.report(turn, call, polled.status === "done" ? polled.notes : undefined);
  }

  /** Poll again after the poll interval (or the Harness's longer hint), or at the deadline if that is sooner. */
  private sleep(turn: CurrentTurn, retryAfterMs = 0): Promise<void> {
    const now = Date.now();
    return this.ctx.storage.setAlarm(now + nextPollDelay(now, Math.max(this.pollMs, retryAfterMs), turn.deadlineAt));
  }

  /**
   * Tell the League a model API call hit a 429, so it (re)starts its backoff.
   * At most one report per RATE_LIMIT_REPORT_MS; best effort: turns don't wait for it,
   * and the returned promise never rejects.
   */
  private reportRateLimit(seating: Seating, source: string): Promise<void> {
    const now = Date.now();
    const last = this.ctx.storage.kv.get<number>("rateLimitReportedAt") ?? 0;
    if (now - last < RATE_LIMIT_REPORT_MS) return Promise.resolve();
    this.ctx.storage.kv.put("rateLimitReportedAt", now);
    const report = this.env.LEAGUE.getByName(seating.league ?? LEAGUE_NAME)
      .reportRateLimit({ matchId: seating.matchId, seat: seating.seat, agentId: seating.agent.id, source })
      .catch(() => {});
    this.ctx.waitUntil(report);
    return report;
  }

  /** A newer turn arrived while we awaited the Harness: drop this work and run the new turn. */
  private async superseded(handle?: TurnHandle): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now());
    const seating = this.ctx.storage.kv.get<Seating>("seating");
    if (handle && seating) await this.cancelAndReport(seating.matchId, handle);
  }

  /** Cancel a turn that no report will follow, then send the Match the seat's usage including it. */
  private async cancelAndReport(matchId: string, handle: TurnHandle): Promise<void> {
    await this.cancel(handle);
    const seat = this.ctx.storage.kv.get<Seating>("seating")?.seat;
    if (seat === undefined) return;
    // Best effort: the seat's next report carries the same cumulative total.
    await this.env.MATCH.getByName(matchId)
      .recordUsage(seat, this.usage)
      .catch(() => {});
  }

  private async cancel(handle: TurnHandle): Promise<void> {
    const seating = this.ctx.storage.kv.get<Seating>("seating");
    if (!seating) return;
    try {
      const ctx = this.context(seating);
      const before = JSON.stringify(ctx.chain);
      const r = await harnessFor(seating.agent, this.env).cancel?.(ctx, handle);
      // A cancelled call was still billed: always keep its usage.
      this.collect(r?.usage);
      const chain = r?.chain;
      // Persist the Harness's cancelled marker, unless a newer turn changed the chain meanwhile.
      if (chain && JSON.stringify(this.ctx.storage.kv.get("chain") ?? {}) === before) {
        this.ctx.storage.kv.put("chain", chain);
      }
    } catch {
      // Best effort: the Match drops a late result by turn ID anyway.
    }
  }

  /** Cancel the Harness turn and report the missed deadline. */
  private async timeOut(turn: CurrentTurn): Promise<void> {
    if (turn.handle) await this.cancel(turn.handle);
    await this.env.MATCH.getByName(turn.matchId).reportTimeout(turn.turnId, turn.seat, this.usage);
    this.updateTurn(turn.turnId, null);
  }

  /** Report the action, with the seat's notes if the turn wrote any (the Match publishes them to Narrator's View only). */
  private async report(turn: CurrentTurn, call: ToolCall | null, notes?: string): Promise<void> {
    const res = await this.env.MATCH.getByName(turn.matchId).submitAction(turn.turnId, turn.seat, call, this.usage, notes);
    if (res.status === "invalid") {
      // Retry the same frozen observation with the error; the Agent corrects itself before the deadline.
      if (this.updateTurn(turn.turnId, { ...turn, handle: null, input: { ...turn.input, error: res.error } })) {
        await this.ctx.storage.setAlarm(Date.now());
      }
      return;
    }
    this.updateTurn(turn.turnId, null);
  }
}
