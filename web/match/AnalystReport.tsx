// The post-Match Analyst's report on the end screen (wl-ofdn). The model drops the
// `analysis` event with Narrator's View off, so this only ever renders in Narrator's View.
import type { EndScreen } from "./model";

const FAILURES: Record<string, string> = {
  timeout: "the Analyst ran out of time",
  no_report: "the Analyst filed no report",
  provision_failed: "the Analyst could not be started",
  no_slot: "no Analyst was free in time",
  spend_cap: "the League reached its spend cap",
};

const MODEL_NAMES: Record<string, string> = { "gemini-4-neon": "Neon" };

export function AnalystReport({ end }: { end: EndScreen }) {
  const a = end.analysis;
  if (!a) return null;
  const who = (seat: number) => {
    const r = end.roles.find((x) => x.seat === seat);
    return r ? `P${seat} ${r.label}` : `P${seat}`;
  };
  const by = `${MODEL_NAMES[a.model] ?? a.model}${a.seconds != null ? ` · ${a.seconds} s` : ""}`;
  if (a.status === "failed") {
    return (
      <section className="mv-analysis" data-testid="analysis" data-status="failed">
        <h4>Analyst ({by})</h4>
        <p className="mv-muted">No analysis: {FAILURES[a.reason] ?? a.reason}.</p>
      </section>
    );
  }
  const r = a.report;
  return (
    <section className="mv-analysis" data-testid="analysis" data-status="ok">
      <h4>Analyst ({by})</h4>
      <p>{r.summary}</p>
      <h5>Turning points</h5>
      <ul>
        {r.turning_points.map((t, i) => (
          <li key={i}>
            <b>{t.when}:</b> {t.what}
          </li>
        ))}
      </ul>
      <h5>Mistakes</h5>
      {r.mistakes.length ? (
        <ul data-testid="analysis-mistakes">
          {r.mistakes.map((m, i) => (
            <li key={i}>
              <b>{who(m.seat)}</b>: {m.what}
              <div className="mv-muted">{m.evidence}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mv-muted">None that met the bar.</p>
      )}
      <h5>Best play</h5>
      <p>
        <b>{who(r.best_play.seat)}</b>: {r.best_play.why}
      </p>
      <h5>Why the winner won</h5>
      <p>{r.why_winner_won}</p>
    </section>
  );
}
