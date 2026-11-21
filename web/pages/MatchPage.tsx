// Bare Match page: the event log, live. God View is on (private events shown).
import { describeEvent } from "../events";
import { useMatchFeed } from "../useMatchFeed";

export function MatchPage({ matchId }: { matchId: string }) {
  const { events, status } = useMatchFeed(matchId);
  return (
    <main>
      <p>
        <a href="/">← League</a>
      </p>
      <h1>Match {matchId.slice(0, 8)}</h1>
      <p data-testid="feed-status">Feed: {status}</p>
      <ol className="event-log">
        {events.map((e) => (
          <li key={e.seq} className={e.audience === "all" ? "" : "private"}>
            <span className="seq">{e.seq}</span> {describeEvent(e, events)}
          </li>
        ))}
      </ol>
    </main>
  );
}
