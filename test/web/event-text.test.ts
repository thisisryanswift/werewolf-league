// The Match page's event text: what Players and Spectators read in the feed.
import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../../src/shared/protocol";
import { commonEvents } from "../../web/events/common";

const log: MatchEvent[] = [
  { kind: "match_setup", audience: "all", seq: 1, ts: 1, data: { seats: [{ seat: 1, label: "Hydrogen #1", displayName: "Mara", agentId: "a1" }] } },
];
const died = (role: string): MatchEvent => ({ kind: "player_died", audience: "all", seq: 2, ts: 2, data: { seat: 1, role, cause: "vote", cycle: 1 } });

describe("Match page event text", () => {
  it("names a dead Player's role by its display name", () => {
    expect(commonEvents.player_died!(died("werewolf").data, log)).toMatch(/was a Werewolf\.$/);
    expect(commonEvents.player_died!(died("seer").data, log)).toMatch(/was a Seer\.$/);
    expect(commonEvents.player_died!(died("doctor").data, log)).toMatch(/was a Doctor\.$/);
    expect(commonEvents.player_died!(died("villager").data, log)).toMatch(/was a Villager\.$/);
  });
});
