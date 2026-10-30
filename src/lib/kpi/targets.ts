/**
 * KPI-9 · How a target reads, wherever it shows (targets, dashboard cards,
 * My KPIs): "−20 % by 2030 from 2024". It describes what the Admin set;
 * progress is the server's.
 */
import type { KpiTargetWithProgress, TargetDirection } from "./contracts";
import { formatNumber } from "../../ui/format";
import { figureDecimals } from "./units";

/**
 * "−20 % by 2030 from 2024", "+15 % by 2028 from 2025", "Keep level to 2030 from 2024". Describes the target the Admin typed.
 * From a zero baseline it names the target figure: "Up to 40 by 2030 from 2024"; in tCO₂e (`unit`) with 3 decimals (#209).
 */
export function targetText(t: Pick<KpiTargetWithProgress, "baseline_value" | "target_value" | "baseline_year" | "target_year" | "direction"> & { unit?: string | null }): string {
  if (t.direction === "maintain") return `Keep level to ${t.target_year} from ${t.baseline_year}`;
  if (!t.baseline_value) return `${t.direction === "reduce" ? "Down" : "Up"} to ${formatNumber(t.target_value, figureDecimals(t.target_value, t.unit, t.target_value % 1 ? 2 : 0))} by ${t.target_year} from ${t.baseline_year}`;
  const pct = Math.round(((t.target_value - t.baseline_value) / Math.abs(t.baseline_value)) * 100);
  return `${pct < 0 ? "−" : "+"}${Math.abs(pct)} % by ${t.target_year} from ${t.baseline_year}`;
}

/** Lower target than baseline = reduce, higher = increase, equal = keep level. */
export function suggestDirection(baseline: number | null, target: number | null): TargetDirection | null {
  if (baseline === null || target === null) return null;
  if (target < baseline) return "reduce";
  if (target > baseline) return "increase";
  return "maintain";
}
