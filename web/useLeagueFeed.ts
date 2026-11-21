// Subscribe to the League WebSocket. The join message (also on every reconnect)
// is a full snapshot; coalesced "tiles" messages after it carry per-tile diffs,
// folded into the snapshot with applyLeagueDiff. `activity` stamps each Match's
// latest activity (see noteActivity) for the grid's promotion without Drama Scores.
import { useEffect, useState } from "react";
import { applyLeagueDiff } from "../src/shared/league-feed";
import type { LeagueMessage, LeagueSnapshot } from "../src/shared/protocol";
import { noteActivity } from "./grid/model";
import type { FeedStatus } from "./useMatchFeed";

interface LeagueFeed {
  league: LeagueSnapshot | null;
  status: FeedStatus;
  activity: Record<string, number>;
}

export function useLeagueFeed(): LeagueFeed {
  const [feed, setFeed] = useState<Omit<LeagueFeed, "status">>({ league: null, activity: {} });
  const [status, setStatus] = useState<FeedStatus>("connecting");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const open = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/api/league/ws`);
      ws.onopen = () => setStatus("live");
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data as string) as LeagueMessage;
        if (msg.type === "league") setFeed((f) => ({ ...f, league: msg.league }));
        else if (msg.type === "tiles")
          setFeed((f) => (f.league ? { league: applyLeagueDiff(f.league, msg), activity: noteActivity(f.activity, msg) } : f));
        else if (msg.type === "leaderboard") setFeed((f) => (f.league ? { ...f, league: { ...f.league, leaderboard: msg.leaderboard } } : f));
      };
      ws.onclose = () => {
        if (stopped) return;
        setStatus("reconnecting");
        retry = setTimeout(open, 1000);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return { ...feed, status };
}
