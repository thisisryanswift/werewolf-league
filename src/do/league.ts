// League DO (stub). Scheduling, ratings and the grid feed come in later tickets;
// for now it only records finished Match results.

import { DurableObject } from "cloudflare:workers";
import type { MatchReport } from "../core/match";

export class LeagueDO extends DurableObject<Env> {
  async reportMatchResult(matchId: string, result: MatchReport): Promise<{ ok: true }> {
    this.ctx.storage.kv.put(`result:${matchId}`, result);
    return { ok: true };
  }
}
