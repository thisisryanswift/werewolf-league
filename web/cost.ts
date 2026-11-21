// Display of measured costs (USD).

/** "$0.42", or "$0.0031" below a cent so small costs don't read as $0.00. */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return "—";
  return usd >= 0.01 || usd === 0 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`;
}
