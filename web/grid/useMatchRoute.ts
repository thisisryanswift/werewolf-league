// The open Match modal lives in the URL hash (#match=<id>). Opening from the
// grid pushes a history entry, so the back button closes the modal; closing
// from inside (Esc, backdrop, Close) goes back over that entry, or, for a
// deep link that has no entry to go back to, just clears the hash.
// Any plain click on an <a href="#match=..."> on the page opens through here.
import { useCallback, useEffect, useState } from "react";
import { matchHash, matchIdFromHash } from "./route";

const STATE_KEY = "wlMatch";

export function useMatchRoute() {
  const [matchId, setMatchId] = useState(() => matchIdFromHash(location.hash));

  useEffect(() => {
    const sync = () => setMatchId(matchIdFromHash(location.hash));
    addEventListener("hashchange", sync);
    addEventListener("popstate", sync);
    return () => {
      removeEventListener("hashchange", sync);
      removeEventListener("popstate", sync);
    };
  }, []);

  const open = useCallback((id: string) => {
    if (matchIdFromHash(location.hash) === id) return;
    history.pushState({ [STATE_KEY]: id }, "", matchHash(id));
    setMatchId(id);
  }, []);

  const close = useCallback(() => {
    if ((history.state as Record<string, unknown> | null)?.[STATE_KEY]) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      setMatchId(null);
    }
  }, []);

  // Delegate clicks on Match links (tiles, featured and finished Match links).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href^='#match=']");
      const id = a && matchIdFromHash(a.getAttribute("href") ?? "");
      if (!id) return;
      e.preventDefault();
      open(id);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  return { matchId, open, close };
}
