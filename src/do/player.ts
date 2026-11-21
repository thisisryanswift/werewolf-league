// Player DO: one per seat per Match. Owns the seat's Harness chain, runs each
// turn in the background, polls on its own alarm and reports the action to the
// Match DO. Deadline enforcement (wl-cpl1) hooks into `alarm()`.

import { DurableObject } from "cloudflare:workers";
import type { AgentConfig, PlayerContext, TurnHandle } from "../core/harness";
import type { TurnAssignment } from "../core/match";
import type { Seat, ToolCall, ToolSpec } from "../core/ruleset";
import { harnessFor } from "../harness";

interface Seating {
  matchId: string;
  seat: Seat;
  agent: AgentConfig;
  tools: ToolSpec[];
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

  /** Called by the Match at start: remember the seat and provision the Harness environment. */
  async provision(seating: Seating): Promise<void> {
    if (this.ctx.storage.kv.get("seating")) return;
    this.ctx.storage.kv.put("seating", seating);
    const chain = await harnessFor(seating.agent, this.env).provision(this.context(seating));
    this.ctx.storage.kv.put("chain", chain);
  }

  /** Called by the Match: take a turn. Returns at once; the work runs on the alarm. */
  async takeTurn(assignment: TurnAssignment): Promise<void> {
    this.ctx.storage.kv.put<CurrentTurn>("turn", { ...assignment, handle: null, attempts: 0 });
    await this.ctx.storage.setAlarm(Date.now());
  }

  async alarm(): Promise<void> {
    const seating = this.ctx.storage.kv.get<Seating>("seating");
    const turn = this.ctx.storage.kv.get<CurrentTurn>("turn");
    if (!seating || !turn) return;
    const harness = harnessFor(seating.agent, this.env);
    const ctx = this.context(seating);

    if (!turn.handle) {
      const started = await harness.startTurn(ctx, turn.input);
      this.ctx.storage.kv.put("chain", started.chain);
      this.ctx.storage.kv.put<CurrentTurn>("turn", { ...turn, handle: started.handle, attempts: turn.attempts + 1 });
      await this.ctx.storage.setAlarm(Date.now() + this.pollMs);
      return;
    }

    const polled = await harness.poll(ctx, turn.handle);
    if (polled.status === "pending") {
      this.ctx.storage.kv.put<CurrentTurn>("turn", { ...turn, handle: polled.handle });
      await this.ctx.storage.setAlarm(Date.now() + this.pollMs);
      return;
    }
    const call: ToolCall | null = polled.status === "done" ? polled.call : null;
    await this.report(turn, call);
  }

  private async report(turn: CurrentTurn, call: ToolCall | null): Promise<void> {
    const match = this.env.MATCH.getByName(turn.matchId);
    const res = await match.submitAction(turn.turnId, turn.seat, call);
    // A newer turn may have arrived while we were reporting.
    const current = this.ctx.storage.kv.get<CurrentTurn>("turn");
    if (current?.turnId !== turn.turnId) return;
    if (res.status === "invalid") {
      // Retry the same frozen observation with the error; the Agent corrects itself.
      this.ctx.storage.kv.put<CurrentTurn>("turn", {
        ...turn,
        handle: null,
        input: { ...turn.input, error: res.error },
      });
      await this.ctx.storage.setAlarm(Date.now());
      return;
    }
    this.ctx.storage.kv.delete("turn");
  }
}
