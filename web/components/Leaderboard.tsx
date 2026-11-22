// Leaderboard panel: Agents ranked by Overall Rating, with sortable Side Rating
// columns, Matches played, wins out of Matches played per Side and per role, Calibration (Brier) and timeouts. It
// renders whatever the League feed last sent, so it updates live as Matches settle.
import { useState } from "react";
import type { Leaderboard as LeaderboardData } from "../../src/shared/protocol";
import { columns } from "../leaderboard/columns";

export { formatRating, sideName } from "../leaderboard/columns";

export function Leaderboard({ data }: { data: LeaderboardData }) {
  const [sortKey, setSortKey] = useState("overall");
  const [showRoles, setShowRoles] = useState(true);
  const roles = data.roles ?? [];
  const cols = columns(data.sides, showRoles ? roles : []);
  const sortCol = cols.find((c) => c.key === sortKey) ?? cols[0]!;
  // Rank is always by Overall Rating (the League's order); sorting only reorders rows.
  const rank = new Map(data.rows.map((r, i) => [r.agentId, i + 1]));
  const rows = [...data.rows].sort((a, b) => sortCol.value(b) - sortCol.value(a) || rank.get(a.agentId)! - rank.get(b.agentId)!);
  return (
    <section className="leaderboard" data-testid="leaderboard">
      <h2>Leaderboard</h2>
      {roles.length > 0 && rows.length > 0 && (
        <p className="muted leaderboard-roles">
          <label>
            <input type="checkbox" checked={showRoles} onChange={(e) => setShowRoles(e.target.checked)} data-testid="show-role-wins" /> Wins by role
          </label>
          {showRoles && data.rolesComplete === false && <span> · still counting role wins from earlier Matches; the role columns are partial.</span>}
        </p>
      )}
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
