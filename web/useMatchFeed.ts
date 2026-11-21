// Subscribe to a Match's WebSocket: full log on join, then live events.
// Events are merged by seq, so reconnects never duplicate or lose events.
import { useEffect, useState } from "react";
import { mergeEvents, type MatchEvent, type ServerMessage } from "../src/shared/protocol";

export type FeedStatus = "connecting" | "live" | "reconnecting";

export function useMatchFeed(matchId: string): { events: MatchEvent[]; status: FeedStatus; matchNumber?: number } {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [matchNumber, setMatchNumber] = useState<number | undefined>();
  const [status, setStatus] = useState<FeedStatus>("connecting");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // A new Match (or a remount) starts from its own full log, never a previous one's.
    setEvents([]);
    setMatchNumber(undefined);
    setStatus("connecting");

    const open = () => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/api/matches/${matchId}/ws`);
      ws.onopen = () => !stopped && setStatus("live");
      ws.onmessage = (m) => {
        if (stopped) return;
        const msg = JSON.parse(m.data as string) as ServerMessage;
        if (msg.type === "log") setMatchNumber(msg.matchNumber);
        const incoming = msg.type === "log" ? msg.events : [msg.event];
        setEvents((prev) => mergeEvents(prev, incoming));
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
  }, [matchId]);

  return { events, status, ...(matchNumber !== undefined ? { matchNumber } : {}) };
}
