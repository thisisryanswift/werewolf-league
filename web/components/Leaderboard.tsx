// Leaderboard panel: Agents ranked by Overall Rating, with sortable Side Rating
// columns, Matches played, wins per Side, Calibration (Brier) and timeouts. It
// renders whatever the League feed last sent, so it updates live as Matches settle.
import { useState } from "react";
import type { AgentStanding, Leaderboard as LeaderboardData } from "../../src/shared/protocol";

/** Display names for Side keys; unknown Sides are capitalised. */
const SIDE_NAMES: Record<string, string> = { wolf: "Wolf", village: "Village" };
export const sideName = (side: string): string => SIDE_NAMES[side] ?? side.charAt(0).toUpperCase() + side.slice(1);

export const formatRating = (r: number): string => Math.round(r).toString();

interface Column {
  key: string;
  label: string;
  title?: string;
  value: (row: AgentStanding) => number;
  render: (row: AgentStanding) => string;
}

function columns(sides: string[]): Column[] {
  return [
    { key: "overall", label: "Overall", title: "Mean of the Side Ratings", value: (r) => r.overall, render: (r) => formatRating(r.overall) },
    ...sides.map((s) => ({
      key: `rating:${s}`,
      label: sideName(s),
      title: `${sideName(s)} Rating`,
      value: (r: AgentStanding) => r.ratings[s] ?? 0,
      render: (r: AgentStanding) => formatRating(r.ratings[s] ?? 0),
    })),
    { key: "matches", label: "Matches", value: (r) => r.matches, render: (r) => String(r.matches) },
    ...sides.map((s) => ({
      key: `wins:${s}`,
      label: `${sideName(s)} wins`,
      value: (r: AgentStanding) => r.wins[s] ?? 0,
      render: (r: AgentStanding) => String(r.wins[s] ?? 0),
    })),
    {
      key: "calibration",
      label: "Calibration",
      title: "Brier score of village-side beliefs at each vote (lower is better)",
      // Sorting is best-first: lower Brier first, Agents with no score last.
      value: (r) => (r.calibration === null ? -Infinity : -r.calibration),
      render: (r) => (r.calibration === null ? "—" : r.calibration.toFixed(3)),
    },
    { key: "timeouts", label: "Timeouts", title: "Turns that missed their deadline", value: (r) => r.timeouts, render: (r) => String(r.timeouts) },
  ];
}

export function Leaderboard({ data }: { data: LeaderboardData }) {
  const [sortKey, setSortKey] = useState("overall");
  const cols = columns(data.sides);
  const sortCol = cols.find((c) => c.key === sortKey) ?? cols[0]!;
  // Rank is always by Overall Rating (the League's order); sorting only reorders rows.
  const rank = new Map(data.rows.map((r, i) => [r.agentId, i + 1]));
  const rows = [...data.rows].sort((a, b) => sortCol.value(b) - sortCol.value(a) || rank.get(a.agentId)! - rank.get(b.agentId)!);
  return (
    <section className="leaderboard" data-testid="leaderboard">
      <h2>Leaderboard</h2>
      {rows.length === 0 ? (
        <p className="muted">No Agents yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Agent</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" title={c.title} aria-sort={c.key === sortCol.key ? "descending" : undefined}>
                  <button type="button" onClick={() => setSortKey(c.key)} data-sort={c.key}>
                    {c.label}
                    {c.key === sortCol.key ? " ▼" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agentId} data-agent-id={r.agentId}>
                <td>{rank.get(r.agentId)}</td>
                <th scope="row">{r.name}</th>
                {cols.map((c) => (
                  <td key={c.key} data-col={c.key}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
