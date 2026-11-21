// Pure geometry for the rating-history chart: scales, ticks and end-label layout.

/** Categorical slots in fixed order (dataviz reference palette, light mode). Agent i gets slot i; never cycled. */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
/** Agents past the eighth slot share a neutral line; their direct label still names them. */
export const OVERFLOW_COLOR = "#8a8984";

/** Nice round tick values covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** The y-domain: always includes the 1200 baseline, padded so lines never touch the frame. */
export function ratingDomain(values: number[], baseline = 1200): [number, number] {
  const lo = Math.min(baseline, ...values);
  const hi = Math.max(baseline, ...values);
  const pad = Math.max(10, (hi - lo) * 0.08);
  return [Math.floor((lo - pad) / 10) * 10, Math.ceil((hi + pad) / 10) * 10];
}

/**
 * Spreads end labels so none overlap: each wants to sit at its line's final y;
 * labels are pushed apart to at least `gap` px, staying within [top, bottom].
 */
export function spreadLabels(wanted: number[], gap: number, top: number, bottom: number): number[] {
  const order = wanted.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed = order.map((o) => o.y);
  for (let k = 0; k < placed.length; k++) placed[k] = Math.max(placed[k]!, k ? placed[k - 1]! + gap : top);
  for (let k = placed.length - 1; k >= 0; k--) placed[k] = Math.min(placed[k]!, k < placed.length - 1 ? placed[k + 1]! - gap : bottom);
  const out = new Array<number>(wanted.length);
  order.forEach((o, k) => (out[o.i] = placed[k]!));
  return out;
}
