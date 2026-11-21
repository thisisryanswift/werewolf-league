// Player DO: one per seat per Match. Owns the seat's Harness chain, runs each
// turn in the background, polls on its own alarm, enforces the turn's deadline
// and reports the action (or a timeout) to the Match DO.

import { DurableObject } from "cloudflare:workers";
import { nextPollDelay } from "../core/deadlines";
import type { AgentConfig, PlayerContext, TurnHandle, UsageReading } from "../core/harness";
import type { TurnAssignment } from "../core/match";
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
}

interface CurrentTurn extends TurnAssignment {
  /** Harness handle once the turn has started; persisted before anything else. */
  handle: TurnHandle | null;
  attempts: number;
}

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
    const chain = await harness.provision({ ...seating, chain: {} });
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

  async alarm(): Promise<void> {
    const seating = this.ctx.storage.kv.get<Seating>("seating");
    const turn = this.turn;
    if (!seating || !turn) return;
    if (Date.now() >= turn.deadlineAt) return this.timeOut(turn);
    const harness = harnessFor(seating.agent, this.env);
    const ctx = this.context(seating);

    if (!turn.handle) {
      const started = await harness.startTurn(ctx, turn.input);
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
      if (!this.updateTurn(turn.turnId, { ...turn, handle: polled.handle })) return this.superseded();
      return this.sleep(turn);
    }
    // An answer that lands after the deadline is too late and counts as a timeout.
    if (Date.now() >= turn.deadlineAt) return this.timeOut(turn);
    const call: ToolCall | null = polled.status === "done" ? polled.call : null;
    await this.report(turn, call);
  }

  /** Poll again after the poll interval, or at the deadline if that is sooner. */
  private sleep(turn: CurrentTurn): Promise<void> {
    const now = Date.now();
    return this.ctx.storage.setAlarm(now + nextPollDelay(now, this.pollMs, turn.deadlineAt));
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

  private async report(turn: CurrentTurn, call: ToolCall | null): Promise<void> {
    const res = await this.env.MATCH.getByName(turn.matchId).submitAction(turn.turnId, turn.seat, call, this.usage);
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
