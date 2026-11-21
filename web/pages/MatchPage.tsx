// The /matches/:id page: the Match view filling the window. wl-gtil's Match
// modal mounts the same <MatchView>. The back link goes to the Match's League.
import { useEffect, useState } from "react";
import { DEFAULT_LEAGUE_ID, searchForLeague } from "../../src/shared/leagues";
import { MatchView } from "../match/MatchView";

export function MatchPage({ matchId }: { matchId: string }) {
  const [leagueId, setLeagueId] = useState(DEFAULT_LEAGUE_ID);
  useEffect(() => {
    fetch(`/api/matches/${matchId}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ league?: string }>) : null))
      .then((s) => s?.league && setLeagueId(s.league))
      .catch(() => {});
  }, [matchId]);
  return (
    <main className="mv-page">
      <a className="mv-back" href={`/${searchForLeague("", leagueId)}`}>
        ← League
      </a>
      <div className="mv-holder">
        <MatchView matchId={matchId} />
      </div>
    </main>
  );
}
