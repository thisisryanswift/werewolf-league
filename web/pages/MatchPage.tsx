// Bare Match page: seats with thinking/timeout markers, and the event log, live.
// God View is on (private events shown).
import type { MatchEvent } from "../../src/shared/protocol";
import { countTimeouts, thinkingSeats } from "../../src/shared/turn-events";
import { describeEvent } from "../events";
import { HIDDEN_KINDS } from "../events/runner";
import { Speech } from "../events/Speech";
import { spectatorLabel } from "../../src/shared/seat-label";
import { useMatchFeed } from "../useMatchFeed";

type SeatInfo = { seat: number; label: string; displayName?: string; agentId: string };

function Seats({ events }: { events: MatchEvent[] }) {
  const seats = (events.find((e) => e.kind === "match_setup")?.data.seats ?? []) as SeatInfo[];
  const thinking = new Set(thinkingSeats(events));
  const timeouts = countTimeouts(events, seats);
  const dead = new Set(events.filter((e) => e.kind === "player_died").map((e) => Number(e.data.seat)));
  return (
    <section>
      <ul className="seats" data-testid="seats">
        {seats.map((s) => {
          const n = timeouts.bySeat[s.seat] ?? 0;
          return (
            <li key={s.seat} data-seat={s.seat} className={dead.has(s.seat) ? "dead" : ""}>
              <span className="seat-label">
                Seat {s.seat} ({spectatorLabel(s)})
              </span>
              {thinking.has(s.seat) && (
                <span className="thinking" data-testid="thinking">
                  thinking…
                </span>
              )}
              {n > 0 && (
                <span className="timeout-badge" data-testid="timeouts" title="Turns that missed their deadline">
                  timed out ×{n}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {Object.values(timeouts.byAgent).some((n) => n > 0) && (
        <p className="timeout-stats" data-testid="agent-timeouts">
          Timeouts by Agent:{" "}
          {Object.entries(timeouts.byAgent)
            .filter(([, n]) => n > 0)
            .map(([agent, n]) => `${seats.find((s) => s.agentId === agent)?.label.replace(/ #\d+$/, "") ?? agent} ${n}`)
            .join(", ")}
        </p>
      )}
    </section>
  );
}

export function MatchPage({ matchId }: { matchId: string }) {
  const { events, status } = useMatchFeed(matchId);
  return (
    <main>
      <p>
        <a href="/">← League</a>
      </p>
      <h1>Match {matchId.slice(0, 8)}</h1>
      <p data-testid="feed-status">Feed: {status}</p>
      <Seats events={events} />
      <ol className="event-log">
        {events
          .filter((e) => !HIDDEN_KINDS.has(e.kind))
          .map((e) => (
            <li
              key={e.seq}
              className={[e.audience === "all" ? "" : "private", e.kind === "turn_timed_out" ? "timeout" : ""].join(" ").trim()}
            >
              <span className="seq">{e.seq}</span>{" "}
              {e.kind === "speech" ? <Speech event={e} log={events} /> : describeEvent(e, events)}
            </li>
          ))}
      </ol>
    </main>
  );
}
