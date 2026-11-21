import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("hiddenAgents", () => {
  it("leaves hidden Agents off the League leaderboard", async () => {
    const league = env.LEAGUE.getByName("hidden-agents-test");
    const before = await league.configure({ n: 0 });
    if (!before.ok) throw new Error(before.error);
    const ids = before.league.leaderboard.rows.map((r) => r.agentId);
    expect(ids.length).toBeGreaterThan(1);
    const hide = ids[0]!;
    const after = await league.configure({ hiddenAgents: [hide] });
    if (!after.ok) throw new Error(after.error);
    expect(after.league.leaderboard.rows.map((r) => r.agentId)).not.toContain(hide);
  });
});
