// Table Suspicion meter (God View only): for each Player, the table's mean
// stated belief that they are on the guessed-at Side, over every ballot so far
// that rates them, next to their true role. It recomputes from the event log,
// so it moves after each vote commits its `beliefs_recorded` event.
//
// God View only: ballots and roles are private. The caller decides visibility;
// this component never filters by God View itself.
import type { MatchEvent } from "../../src/shared/protocol";
import { tableSuspicion, type Ballot } from "../../src/shared/beliefs";

type SeatInfo = { seat: number; label: string };

export function TableSuspicion({ events }: { events: MatchEvent[] }) {
  const recorded = events.filter((e) => e.kind === "beliefs_recorded");
  const meter = tableSuspicion(recorded.flatMap((e) => (e.data.ballots ?? []) as Ballot[]));
  const seats = (events.find((e) => e.kind === "match_setup")?.data.seats ?? []) as SeatInfo[];
  const roles = new Map(events.filter((e) => e.kind === "role_assigned").map((e) => [Number(e.data.seat), String(e.data.role)]));
  const dead = new Set(events.filter((e) => e.kind === "player_died").map((e) => Number(e.data.seat)));
  const votes = recorded.length;
  return (
    <section className="table-suspicion god-view-only" data-testid="table-suspicion" data-god-view-only data-votes={votes}>
      <h2>Table Suspicion</h2>
      {votes === 0 ? (
        <p className="muted">No votes yet.</p>
      ) : (
        <>
          <p className="muted">The table's average stated suspicion of each Player, over {votes === 1 ? "1 vote" : `${votes} votes`}.</p>
          <ul>
            {seats.map((s) => {
              const m = meter[s.seat];
              const pct = m ? Math.round(m.mean * 100) : null;
              return (
                <li key={s.seat} data-seat={s.seat} data-suspicion={m ? m.mean.toFixed(4) : ""} className={dead.has(s.seat) ? "dead" : ""}>
                  <span className="ts-who">
                    Seat {s.seat} ({s.label})
                  </span>
                  <span className={`ts-role role-${roles.get(s.seat) ?? "unknown"}`}>{roles.get(s.seat) ?? "?"}</span>
                  <span className="ts-bar" aria-hidden="true">
                    <span style={{ width: `${pct ?? 0}%` }} />
                  </span>
                  <span className="ts-value" title={m ? `Rated by ${m.ballots} ballot${m.ballots === 1 ? "" : "s"}` : "No ballots rate this Player"}>
                    {pct === null ? "—" : `${pct}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
