// Seam 3: the Narrator. A scripted fake Narrator in whole-system tests (real
// League/Match/Player DOs and alarms): results become Match events and reach
// tile summaries, God View tagging hides secret flags, a failing or slow
// Narrator never holds up a Match, and at most one call per Match is in flight.

import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { visibleDramaFlags, type LeagueSnapshot, type MatchEvent, type MatchSummary } from "../../src/shared/protocol";
import { ADMIN, decisions, fakeAgent, finished, snapshot, startMatch, waitFor } from "./helpers";

async function league(): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch("http://test/api/league");
  if (!res.ok) throw new Error(`league snapshot failed: ${res.status}`);
  return res.json();
}

async function admin(op: string, body?: unknown) {
  const r = await exports.default.fetch(`http://test/api/admin/league/${op}`, {
    method: "POST",
    headers: { ...ADMIN, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}

const table = (prefix: string, opts: Record<string, unknown> = { delayPolls: 1 }) =>
  Array.from({ length: 7 }, (_, i) => fakeAgent(`${prefix}-${i + 1}`, opts));

const NARRATION_KINDS = new Set(["drama", "drama_secret"]);
const narration = (events: MatchEvent[]) => events.filter((e) => NARRATION_KINDS.has(e.kind));
const withoutNarration = (events: MatchEvent[]) => events.filter((e) => !NARRATION_KINDS.has(e.kind));

/** Every tile summary the League shows while `until` is false, in the order seen. */
async function watchTiles(until: () => Promise<boolean>): Promise<MatchSummary[]> {
  const seen: MatchSummary[] = [];
  for (;;) {
    const s = await league();
    for (const t of s.tiles) if (t.summary) seen.push(t.summary);
    if (await until()) return seen;
    await new Promise((r) => setTimeout(r, 5));
  }
}

afterEach(async () => {
  await admin("pause");
  await waitFor(async () => (await league()).tiles.length === 0);
});

describe("the Narrator", () => {
  it("records each narration as Match events and puts the Drama Score and active flags on the tile", async () => {
    const narrator = {
      id: "fake",
      options: { dramaScore: 0.8, flags: { claim_war: 0.9, table_split: 0.3, wolf_fooling_table: 0.95 } },
    };
    await admin("config", { n: 1, roster: table("n1"), narrator });
    await admin("resume");
    const tiles = await watchTiles(async () => (await league()).stats.started >= 1 && (await league()).recent.length >= 1);
    await admin("pause");

    const flagged = tiles.find((t) => t.dramaScore !== undefined);
    expect(flagged).toBeDefined();
    expect(flagged!.dramaScore).toBe(0.8);
    // Only flags at or above the threshold (default 0.7) are active.
    expect(flagged!.dramaFlags).toEqual([
      { id: "claim_war", visibility: "public-safe" },
      { id: "wolf_fooling_table", visibility: "secret" },
    ]);

    const matchId = (await league()).recent[0]!.matchId;
    const events = (await snapshot(matchId)).events;
    const pub = events.find((e) => e.kind === "drama")!;
    expect(pub.audience).toBe("all");
    expect(pub.data).toMatchObject({ dramaScore: 0.8 });
    expect(pub.data.flags).toContainEqual({ id: "claim_war", value: 0.9, visibility: "public-safe", active: true });
    expect(pub.data.flags).toContainEqual({ id: "table_split", value: 0.3, visibility: "public-safe", active: false });
    const secret = events.find((e) => e.kind === "drama_secret")!;
    expect(secret.audience).toEqual([]);
    expect(secret.data.flags).toContainEqual({ id: "wolf_fooling_table", value: 0.95, visibility: "secret", active: true });
  });
});
