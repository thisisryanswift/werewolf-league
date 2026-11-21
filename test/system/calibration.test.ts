// Calibration (Brier) through real League/Match/Player DOs: scripted Agents
// state fixed beliefs at every vote, and the leaderboard shows each Agent's
// Brier over its village Players' normalized ballots.
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { drawTable } from "../../src/core/draw";
import { werewolf } from "../../src/rulesets/werewolf";
import type { AgentStanding, LeagueSnapshot } from "../../src/shared/protocol";
import { ADMIN, fakeAgent, snapshot, waitFor } from "./helpers";

async function league(): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch("http://test/api/league");
  if (!res.ok) throw new Error(`league snapshot failed: ${res.status}`);
  return res.json();
}

async function admin(op: string, body: unknown = {}) {
  const res = await exports.default.fetch(`http://test/api/admin/league/${op}`, {
    method: "POST",
    headers: { ...ADMIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${op}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<LeagueSnapshot>;
}

/** The first seed whose deal gives `a` six seats (one of them a wolf) and `w` one wolf seat. */
function findSeed(a: string, w: string) {
  for (let i = 0; i < 20_000; i++) {
    const seed = `cal-${i}`;
    const draw = drawTable({
      roster: [fakeAgent(a), fakeAgent(w)],
      seats: 7,
      seed,
      check: (seats) => {
        const r = werewolf.setup({}, seed, seats);
        return r.ok ? null : r.error;
      },
    });
    if (!draw.ok) continue;
    const r = werewolf.setup({}, seed, draw.seats);
    if (!r.ok) continue;
    const wolves = r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
    const wSeats = draw.seats.filter((s) => s.agentId === w).map((s) => s.seat);
    if (wSeats.length === 1 && wolves.includes(wSeats[0]!)) {
      return { seed, wSeat: wSeats[0]!, aWolf: wolves.find((s) => s !== wSeats[0])!, village: draw.seats.filter((s) => !wolves.includes(s.seat)).map((s) => s.seat) };
    }
  }
  throw new Error("no seed");
}

const row = (l: LeagueSnapshot, id: string): AgentStanding => l.leaderboard.rows.find((r) => r.agentId === id)!;

describe("Calibration", () => {
  it("scores each Agent's village ballots with Brier; wolf Players' beliefs are not scored", async () => {
    const deal = findSeed("cal-a", "cal-w");
    // Everyone abstains and nobody kills, so all 7 Players vote on each of the 6 Days
    // and the wolves win at the cycle cap. Agent cal-a puts all its belief on cal-w's seat;
    // cal-w puts all its belief on a village seat.
    const roster = [
      fakeAgent("cal-a", { script: "passive", args: { vote: { beliefs: { [deal.wSeat]: 1 } } } }),
      fakeAgent("cal-w", { script: "passive", args: { vote: { beliefs: { [deal.village[0]!]: 1 } } } }),
    ];
    await admin("config", { n: 1, roster, seeds: [deal.seed] });
    const started = await admin("resume");
    await admin("pause");
    const tile = started.tiles.find((t) => t.seed === deal.seed)!;
    await waitFor(async () => (await league()).recent.some((r) => r.matchId === tile.matchId), 60_000);
    expect((await snapshot(tile.matchId)).result?.winner).toBe("wolf");

    const l = await league();
    // Each of cal-a's 5 village ballots, normalized to the 2 wolves among its 6 others:
    // cal-w's seat 1 (capped), the other 5 seats 0.2 each. Squared errors: cal-w 0,
    // cal-a's own wolf seat (1 - 0.2)^2 = 0.64, four villagers 0.04 each: 0.8 over 6 beliefs.
    // Every ballot is the same, so Brier = 0.8 / 6 = 2/15. (Scoring cal-a's wolf ballot,
    // which is exactly right, would give 24/216 = 1/9 instead.)
    expect(row(l, "cal-a").calibration).toBeCloseTo(2 / 15, 12);
    // cal-w only played a wolf: nothing to score.
    expect(row(l, "cal-w").calibration).toBeNull();

    // Match 2, same deal: cal-a now puts all its belief on village seat vx. Each day, the
    // 4 other village ballots give vx 1, the rest 0.2: errors vx 1, two wolves 0.64 each,
    // three villagers 0.04 each = 2.4. vx's own ballot has no stated belief among its
    // others, so it is uniform 1/3: two wolves (2/3)^2, four villagers (1/3)^2 = 4/3.
    // Pooled over both Matches: 6 * (5 * 0.8 + 4 * 2.4 + 4/3) = 89.6 over 6 * 60 = 360 beliefs.
    const vx = deal.village[0]!;
    const roster2 = [
      fakeAgent("cal-a", { script: "passive", args: { vote: { beliefs: { [vx]: 1 } } } }),
      fakeAgent("cal-w", { script: "passive", args: { vote: { beliefs: { [vx]: 1 } } } }),
    ];
    await admin("config", { n: 1, roster: roster2, seeds: [deal.seed] });
    const started2 = await admin("resume");
    await admin("pause");
    const tile2 = started2.tiles.find((t) => t.seed === deal.seed && t.matchId !== tile.matchId)!;
    await waitFor(async () => (await league()).recent.some((r) => r.matchId === tile2.matchId), 60_000);
    const l2 = await league();
    expect(row(l2, "cal-a").calibration).toBeCloseTo(56 / 225, 12);
    expect(row(l2, "cal-w").calibration).toBeNull();
  }, 180_000);
});
