import { formatWithUnit } from "../../../lib/kpi/units";

export type SparkPoint = { label: string; value: number | null };

/** "Water withdrawn, 12 months: from 3,500 m³ (Oct 2025) to 3,200 m³ (Sep 2026)." */
export function sparkSummary(name: string, points: SparkPoint[], unit: string | null): string {
  const known = points.filter((p) => p.value !== null);
  if (!known.length) return `${name}: no values yet.`;
  const first = known[0];
  const last = known[known.length - 1];
  return `${name}, ${points.length} periods: from ${formatWithUnit(first.value, unit)} (${first.label}) to ${formatWithUnit(last.value, unit)} (${last.label}).`;
}
