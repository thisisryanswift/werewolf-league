// Subscribe to the League WebSocket. Every message is a full snapshot, so the
// latest one wins and reconnects need no merging.
import { useEffect, useState } from "react";
import type { LeagueMessage, LeagueSnapshot } from "../src/shared/protocol";
import type { FeedStatus } from "./useMatchFeed";

export function useLeagueFeed(): { league: LeagueSnapshot | null; status: FeedStatus } {
  const [league, setLeague] = useState<LeagueSnapshot | null>(null);
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
        if (msg.type === "league") setLeague(msg.league);
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

  return { league, status };
}
