import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ADMIN, fakeAgent, snapshot, waitFor } from "./helpers";
import type { LeagueSnapshot } from "../../src/shared/protocol";

async function league(): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch("http://test/api/league");
  if (!res.ok) throw new Error(`league snapshot failed: ${res.status}`);
  return res.json();
}

function admin(op: string, body?: unknown, headers: Record<string, string> = ADMIN) {
  return exports.default.fetch(`http://test/api/admin/league/${op}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function ok(res: Promise<Response>) {
  const r = await res;
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** Fast fake roster: every Agent ends turns at once. */
const roster = (n: number, opts: Record<string, unknown> = { delayPolls: 1 }) =>
  Array.from({ length: n }, (_, i) => fakeAgent(`lg-${i + 1}`, opts));

/** Pause and wait for running Matches to finish, so each test leaves a quiet League. */
async function drain() {
  await ok(admin("pause"));
  await waitFor(async () => (await league()).tiles.length === 0);
}

describe("League scheduling", () => {
  it("rejects every admin operation without the shared secret", async () => {
    for (const op of ["pause", "resume", "config"]) {
      expect((await admin(op, { n: 1 }, {})).status, op).toBe(401);
      expect((await admin(op, { n: 1 }, { "x-admin-secret": "wrong" })).status, op).toBe(401);
    }
    // Nothing changed.
    expect((await league()).config.paused).toBe(true);
  });

  it("keeps N Matches running, replaces finished ones, takes a new N and stops on pause", async () => {
    await ok(admin("config", { n: 2, roster: roster(3) }));
    await ok(admin("resume"));
    const two = await waitFor(async () => {
      const s = await league();
      return s.tiles.length === 2 ? s : null;
    });
    expect(two.config).toMatchObject({ n: 2, paused: false });

    // Finished Matches are replaced: more Matches start than were first started,
    // and the grid stays at N.
    const replaced = await waitFor(async () => {
      const s = await league();
      return s.stats.settled >= 2 && s.stats.started >= 4 ? s : null;
    });
    expect(replaced.tiles).toHaveLength(2);
    for (const t of replaced.recent) {
      expect((await snapshot(t.matchId)).status).toBe("finished");
    }

    await ok(admin("config", { n: 3 }));
    await waitFor(async () => (await league()).tiles.length === 3);

    await ok(admin("pause"));
    const atPause = (await league()).stats.started;
    await waitFor(async () => (await league()).tiles.length === 0);
    const after = await league();
    expect(after.stats.started).toBe(atPause);
    expect(after.config.paused).toBe(true);
    // Every started Match is settled once.
    expect(after.stats.settled).toBe(after.stats.started);
  });
});
