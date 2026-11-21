// A speech on the Match page: speaker, text, Accusations, defences and a Claim badge.
// Speeches are committed in presentation order, so log order is the order Agents saw.
import type { MatchEvent } from "../../src/shared/protocol";
import { claimText, roundLabel, type SpeechData } from "./day";
import { seatLabel } from "./types";

export function Speech({ event, log }: { event: MatchEvent; log: MatchEvent[] }) {
  const s = event.data as unknown as SpeechData;
  return (
    <span className="speech" data-testid="speech" data-seat={s.seat} data-round={s.round}>
      <span className="round">
        Day {s.cycle} {roundLabel(s.round)}
      </span>{" "}
      <strong>{seatLabel(s.seat, log)}</strong>
      {s.skipped ? (
        <em> said nothing.</em>
      ) : (
        <>
          : “{s.text}”
          {s.accuse.map((x) => (
            <span key={`a${x}`} className="badge accuse">
              accuses {seatLabel(x, log)}
            </span>
          ))}
          {s.defend.map((x) => (
            <span key={`d${x}`} className="badge defend">
              defends {seatLabel(x, log)}
            </span>
          ))}
          {s.claim && <span className="badge claim">{claimText(s.claim, log)}</span>}
        </>
      )}
    </span>
  );
}
