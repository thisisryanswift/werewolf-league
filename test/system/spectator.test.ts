import { describe, expect, it } from "vitest";
import { mergeEvents, type MatchEvent, type ServerMessage } from "../../src/shared/protocol";
import { connect, decisions, fakeAgent, finished, snapshot, startMatch, waitFor } from "./helpers";

const slowTable = (delayPolls: number) =>
  Array.from({ length: 7 }, (_, i) => fakeAgent(`slow-${i + 1}`, { script: "first-legal", delayPolls }));

const logOf = (msgs: ServerMessage[]) => msgs.filter((m) => m.type === "log");
const liveOf = (msgs: ServerMessage[]) => msgs.flatMap((m) => (m.type === "event" ? [m.event] : []));
const seqs = (events: MatchEvent[]) => events.map((e) => e.seq);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("Spectator WebSocket", () => {
  it("delivers the full event log on joining mid-Match, then live events", async () => {
    const matchId = await startMatch({ seed: "mid-join", agents: slowTable(3) });
    // Join once Night 1 has resolved but the Match is still running.
    await waitFor(async () => {
      const s = await snapshot(matchId);
      return s.status === "running" && s.events.some((e) => e.kind === "night_passed");
    });
    const spectator = await connect(matchId);
    const done = await finished(matchId);
    await waitFor(async () => liveOf(spectator.messages).at(-1)?.kind === "match_cost");
    spectator.close();

    const [first, ...rest] = spectator.messages;
    expect(first?.type).toBe("log");
    const log = first!.type === "log" ? first!.events : [];
    expect(log.some((e) => e.kind === "night_passed")).toBe(true);
    expect(seqs(log)).toEqual(range(1, log.length));
    expect(rest.every((m) => m.type === "event")).toBe(true);
    const live = liveOf(rest);
    expect(live.length).toBeGreaterThan(0);
    // Log then live covers the whole Match exactly once, in order.
    expect(seqs([...log, ...live])).toEqual(range(1, done.events.length));
    expect(decisions([...log, ...live])).toEqual(decisions(done.events));
  });

  it("a Spectator reconnecting while a step is in progress ends up with every event exactly once", async () => {
    const matchId = await startMatch({ seed: "reconnect", agents: slowTable(10) });
    const first = await connect(matchId);
    // Wait until at least one live event arrived and a step is in progress.
    await waitFor(async () => liveOf(first.messages).some((e) => e.kind === "phase_started" && e.data.phase === "day"));
    first.close();
    const midStep = await snapshot(matchId);
    expect(midStep.status).toBe("running");
    expect(midStep.events.at(-1)?.kind).toBe("turn_started"); // the Day vote step is in flight

    const second = await connect(matchId);
    const done = await finished(matchId);
    await waitFor(async () => liveOf(second.messages).at(-1)?.kind === "match_cost");
    second.close();

    expect(logOf(second.messages)).toHaveLength(1);
    let client: MatchEvent[] = [];
    for (const m of [...first.messages, ...second.messages]) {
      client = mergeEvents(client, m.type === "log" ? m.events : [m.event]);
    }
    expect(seqs(client)).toEqual(range(1, done.events.length));
    expect(decisions(client)).toEqual(decisions(done.events));
    // The second join's log overlaps what the first connection saw; dedupe is by seq.
    const secondLog = logOf(second.messages)[0]!;
    expect(secondLog.type === "log" && secondLog.events.length).toBeGreaterThanOrEqual(liveOf(first.messages).at(-1)!.seq);
  });

  it("returns 404 for an unknown Match", async () => {
    await expect(snapshot("no-such-match")).rejects.toThrow("404");
  });
});
