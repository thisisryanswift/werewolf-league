// The Match modal: a <dialog> over the live grid that mounts <MatchView>.
// Esc and a backdrop click close it natively (closedby="any"), with a click
// fallback for browsers without closedby; every close goes through onClose so
// the URL follows. Unmounting it closes the Match WebSocket.
import { useEffect, useRef } from "react";
import { MatchView } from "../match/MatchView";

const TITLE_ID = "lg-match-title";
const closedBySupported = typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;

export interface MatchModalProps {
  matchId: string;
  narratorView: boolean;
  onNarratorViewChange: (on: boolean) => void;
  /** Called when the dialog closes (Esc, backdrop or the Close button). */
  onClose: () => void;
}

export function MatchModal({ matchId, narratorView, onNarratorViewChange, onClose }: MatchModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const closed = () => onCloseRef.current();
    // Light dismiss for browsers without closedby: a click on the backdrop targets the dialog itself.
    const backdrop = (e: MouseEvent) => {
      if (closedBySupported || e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right) return;
      d.close();
    };
    d.addEventListener("close", closed);
    d.addEventListener("click", backdrop);
    return () => {
      d.removeEventListener("close", closed);
      d.removeEventListener("click", backdrop);
    };
  }, []);

  return (
    <dialog ref={ref} className="lg-dialog" aria-labelledby={TITLE_ID} data-testid="match-modal" {...({ closedby: "any" } as object)}>
      <MatchView matchId={matchId} narratorView={narratorView} onNarratorViewChange={onNarratorViewChange} onClose={() => ref.current?.close()} titleId={TITLE_ID} />
    </dialog>
  );
}
