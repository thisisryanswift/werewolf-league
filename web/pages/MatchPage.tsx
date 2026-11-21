// The /matches/:id page: the Match view filling the window. wl-gtil's Match
// modal mounts the same <MatchView>.
import { MatchView } from "../match/MatchView";

export function MatchPage({ matchId }: { matchId: string }) {
  return (
    <main className="mv-page">
      <a className="mv-back" href="/">
        ← League
      </a>
      <div className="mv-holder">
        <MatchView matchId={matchId} />
      </div>
    </main>
  );
}
