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

  it("hides secret Drama Flags with God View off and shows public-safe ones", async () => {
    const narrator = { id: "fake", options: { flags: { claim_war: 0.9, wolves_split: 0.9 } } };
    const matchId = await startMatch({ seed: "narrator-godview", agents: table("n2"), narrator });
    await finished(matchId);
    const events = await waitFor(async () => {
      const ev = (await snapshot(matchId)).events;
      return narration(ev).length ? ev : null;
    });

    const off = werewolf.view(events, { spectator: true, godView: false });
    expect(off.some((e) => e.kind === "drama_secret")).toBe(false);
    const pub = off.find((e) => e.kind === "drama")!;
    expect(JSON.stringify(pub.data)).not.toContain("wolves_split");
    expect(pub.data.flags).toContainEqual({ id: "claim_war", value: 0.9, visibility: "public-safe", active: true });
    // The bare Drama Score is shown even with God View off.
    expect(pub.data.dramaScore).toBe(0.5);

    const on = werewolf.view(events, { spectator: true, godView: true });
    expect(on.some((e) => e.kind === "drama_secret")).toBe(true);

    // Tile flags carry their visibility so the grid filters them the same way.
    const tileFlags = [
      { id: "claim_war", visibility: "public-safe" as const },
      { id: "wolves_split", visibility: "secret" as const },
    ];
    expect(visibleDramaFlags(tileFlags, false)).toEqual([{ id: "claim_war", visibility: "public-safe" }]);
    expect(visibleDramaFlags(tileFlags, true)).toEqual(tileFlags);
  });

  it("the Narrator never changes the Match, and a failing or hanging one never delays it", async () => {
    const agents = table("n3", { delayPolls: 1, echo: "text" });
    const seed = "narrator-isolation";
    const plain = await startMatch({ seed, agents });
    const failing = await startMatch({ seed, agents, narrator: { id: "fake", options: { failAfter: 0 } } });
    const hanging = await startMatch({ seed, agents, narrator: { id: "fake", timeoutMs: 60_000, options: { hangAfter: 0 } } });
    const working = await startMatch({ seed, agents, narrator: { id: "fake", options: { flags: { claim_war: 1 } } } });
    const [a, b, c, d] = await Promise.all([finished(plain), finished(failing), finished(hanging), finished(working)]);
    // Same game decisions and result: observations (echoed into speeches) are untouched.
    expect(decisions(withoutNarration(b.events))).toEqual(decisions(a.events));
    expect(decisions(withoutNarration(c.events))).toEqual(decisions(a.events));
    expect(b.result).toEqual(a.result);
    expect(c.result).toEqual(a.result);
    // Nor does a working one: its narrations are interleaved in the log but never reach Players.
    expect(narration(d.events).length).toBeGreaterThan(0);
    expect(decisions(withoutNarration(d.events))).toEqual(decisions(a.events));
    expect(d.result).toEqual(a.result);
    // A hung call (timeout far beyond the Match) never held a step.
    expect(narration(c.events)).toHaveLength(0);
  });

  it("keeps the tile's last Drama Score when later calls fail or time out", async () => {
    for (const options of [{ failAfter: 1 }, { hangAfter: 1 }]) {
      const narrator = { id: "fake", timeoutMs: 20, options: { dramaScore: 0.6, ...options } };
      await admin("config", { n: 1, roster: table(`n4-${Object.keys(options)[0]}`), narrator });
      await admin("resume");
      const before = (await league()).recent.length;
      const tiles = await watchTiles(async () => (await league()).recent.length > before);
      await admin("pause");
      await waitFor(async () => (await league()).tiles.length === 0);

      const scored = tiles.findIndex((t) => t.dramaScore !== undefined);
      expect(scored, JSON.stringify(options)).toBeGreaterThanOrEqual(0);
      const after = tiles.slice(scored);
      // The phase moved on after the only successful narration, and every later tile kept its score.
      expect(new Set(after.map((t) => `${t.phase} ${t.round}`)).size).toBeGreaterThan(1);
      for (const t of after) expect(t.dramaScore).toBe(0.6);

      const matchId = (await league()).recent[0]!.matchId;
      expect(narration((await snapshot(matchId)).events).filter((e) => e.kind === "drama")).toHaveLength(1);
    }
  });

  it("has at most one Narrator call in flight per Match, and a newer step supersedes queued ones", async () => {
    const narrator = { id: "fake", options: { delayMs: 150, reportInFlight: true } };
    const matchId = await startMatch({ seed: "narrator-throttle", agents: table("n5"), narrator });
    const done = await finished(matchId);
    const steps = done.events.filter((e) => e.kind === "step_resolved").length;
    // Wait until the last narration has covered the final log.
    const events = await waitFor(async () => {
      const ev = (await snapshot(matchId)).events;
      const last = narration(ev).filter((e) => e.kind === "drama").at(-1);
      const tail = withoutNarration(ev).at(-1)!.seq;
      return last && Number(last.data.throughSeq) >= tail ? ev : null;
    });
    const drama = events.filter((e) => e.kind === "drama");
    for (const e of drama) {
      const inFlight = (e.data.flags as { id: string; value: number }[]).find((f) => f.id === "fake_max_in_flight");
      expect(inFlight?.value).toBe(1);
    }
    // Steps resolve faster than the Narrator answers, so queued narrations were superseded.
    expect(drama.length).toBeGreaterThan(1);
    expect(drama.length).toBeLessThan(steps);
  });
});
