// Line chart of each Agent's Overall Rating over Match Numbers, inline SVG.
// One line per Agent in fixed palette order, a dashed 1200 baseline, a legend
// plus direct end labels, and a crosshair tooltip on hover. The table below the
// chart (the Leaderboard) is the accessible table view.
import { useMemo, useRef, useState } from "react";
import type { RatingsHistory } from "../../src/core/ratings-history";
import { INITIAL_RATING } from "../../src/shared/protocol";
import { niceTicks, OVERFLOW_COLOR, ratingDomain, SERIES_COLORS, spreadLabels } from "./chart-model";

const W = 1800;
const H = 620;
const M = { top: 20, right: 230, bottom: 56, left: 72 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;

export const colorOf = (i: number) => SERIES_COLORS[i] ?? OVERFLOW_COLOR;

export function RatingChart({ history }: { history: RatingsHistory }) {
  const { agents, points } = history;
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geo = useMemo(() => {
    const all = points.flatMap((p) => Object.values(p.overall));
    const [y0, y1] = ratingDomain(all, INITIAL_RATING);
    // x is the point index (Match Numbers can skip unrated Matches); ticks show Match Numbers.
    const n = points.length;
    const x = (i: number) => M.left + (n <= 1 ? PW / 2 : (i / (n - 1)) * PW);
    const y = (v: number) => M.top + PH - ((v - y0) / (y1 - y0)) * PH;
    const yTicks = niceTicks(y0, y1, 6);
    const xTickIdx = n <= 1 ? [0] : niceTicks(0, n - 1, 10).filter((i) => Number.isInteger(i));
    return { x, y, yTicks, xTickIdx };
  }, [points]);

  if (points.length === 0) return <p className="lg-chart-empty">No rated Matches yet. Lines appear as Matches settle.</p>;

  const last = points[points.length - 1]!;
  const endY = agents.map((a) => geo.y(last.overall[a.agentId] ?? INITIAL_RATING));
  const labelY = spreadLabels(endY, 24, M.top + 8, M.top + PH);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const n = points.length;
    const i = n <= 1 ? 0 : Math.round(((px - M.left) / PW) * (n - 1));
    setHover(i < 0 || i >= n ? null : i);
  };

  const hp = hover === null ? null : points[hover]!;
  const ranked = hp ? [...agents].map((a, i) => ({ a, i, v: hp.overall[a.agentId] })).filter((r) => r.v !== undefined).sort((p, q) => q.v! - p.v!) : [];

  return (
    <figure className="lg-chart" data-testid="rating-chart">
      <ul className="lg-chart-legend" aria-label="Agents">
        {agents.map((a, i) => (
          <li key={a.agentId}>
            <span className="lg-chart-swatch" style={{ background: colorOf(i) }} />
            {a.name}
          </li>
        ))}
      </ul>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Overall Rating of ${agents.length} Agents over ${points.length} rated Matches`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {geo.yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + PW} y1={geo.y(t)} y2={geo.y(t)} className="grid" />
            <text x={M.left - 12} y={geo.y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}
        <line x1={M.left} x2={M.left + PW} y1={geo.y(INITIAL_RATING)} y2={geo.y(INITIAL_RATING)} className="baseline" />
        {geo.xTickIdx.map((i) => (
          <text key={i} x={geo.x(i)} y={M.top + PH + 28} className="tick" textAnchor="middle">
            {points[i]?.matchNumber}
          </text>
        ))}
        <text x={M.left + PW / 2} y={H - 6} className="axis-title" textAnchor="middle">
          Match Number
        </text>
        <text x={18} y={M.top + PH / 2} className="axis-title" textAnchor="middle" transform={`rotate(-90 18 ${M.top + PH / 2})`}>
          Overall Rating
        </text>
        {agents.map((a, i) => {
          const d = points
            .map((p, k) => (p.overall[a.agentId] === undefined ? null : `${geo.x(k).toFixed(1)},${geo.y(p.overall[a.agentId]!).toFixed(1)}`))
            .filter(Boolean)
            .join(" L");
          return <path key={a.agentId} d={`M${d}`} className="series" stroke={colorOf(i)} />;
        })}
        {agents.map((a, i) => {
          const v = last.overall[a.agentId] ?? INITIAL_RATING;
          const ex = geo.x(points.length - 1);
          return (
            <g key={a.agentId}>
              <circle cx={ex} cy={endY[i]} r={5} fill={colorOf(i)} className="end" />
              <line x1={ex + 8} x2={M.left + PW + 14} y1={endY[i]} y2={labelY[i]} stroke={colorOf(i)} className="leader" />
              <text x={M.left + PW + 20} y={labelY[i]} className="end-label" dominantBaseline="middle">
                {a.name} <tspan className="end-value">{Math.round(v)}</tspan>
              </text>
            </g>
          );
        })}
        {hp && hover !== null && (
          <g pointerEvents="none">
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={M.top} y2={M.top + PH} className="crosshair" />
            {ranked.map(({ a, i, v }) => (
              <circle key={a.agentId} cx={geo.x(hover)} cy={geo.y(v!)} r={6} fill={colorOf(i)} className="end" />
            ))}
          </g>
        )}
      </svg>
      {hp && (
        <div className="lg-chart-tip" role="status" style={{ left: `${(geo.x(hover!) / W) * 100}%` }}>
          <b>Match {hp.matchNumber}</b>
          {ranked.map(({ a, i, v }) => (
            <div key={a.agentId}>
              <span className="lg-chart-swatch" style={{ background: colorOf(i) }} />
              {a.name} <span className="lg-mono">{Math.round(v!)}</span>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
