// IN-1 · Words for the hero strip. Shapes text only; every figure is the server's.
import type { InsightsQuery, Summary } from "../../../lib/insights/contracts";
import { pctNumber, unitText } from "../../../lib/insights/labels";
import { PILLAR_LABEL } from "../../../lib/kpi/labels";
import { formatNumber } from "../../../ui/format";

/** What a change is compared with: "2025" / "FY 2025" for last year, "the base year" for base. */
export function compareLabel(q: Pick<InsightsQuery, "year" | "yearType" | "compare">): string {
  if (q.compare === "base") return "the base year";
  return q.yearType === "FY" ? `FY ${q.year - 1}` : String(q.year - 1);
}

/** The "Compare with" options (G3): the year itself, as the brief writes it ("vs 2025", "vs FY 2025"), or "vs base year". */
export function compareOptions(q: Pick<InsightsQuery, "year" | "yearType">): { value: InsightsQuery["compare"]; label: string }[] {
  return [
    { value: "prior", label: `vs ${q.yearType === "FY" ? "FY " : ""}${q.year - 1}` },
    { value: "base", label: "vs base year" },
  ];
}

/** Intensity decimals: 3 below 1, 2 below 10, 1 above (a display rule; the value is the server's). */
export function intensityDecimals(v: number | null): number {
  if (v === null) return 1;
  const a = Math.abs(v);
  return a < 1 ? 3 : a < 10 ? 2 : 1;
}

/** "tCO₂e per t" for the production unit "t". */
export const intensityUnit = (unit: string) => `tCO₂e per ${unitText(unit)}`;

/** "3.4% above the 2030 pathway" / "2.1% below the 2030 pathway". */
export function pathwayHint(p: NonNullable<Summary["pathway"]>): string | null {
  if (p.gap_pct === null) return p.target_year ? `Target year ${p.target_year}` : null;
  const where = p.gap_pct > 0 ? "above" : p.gap_pct < 0 ? "below" : "on";
  const pathway = p.target_year ? `the ${p.target_year} pathway` : "the pathway";
  return where === "on" ? `On ${pathway}` : `${pctNumber(p.gap_pct)}% ${where} ${pathway}`;
}

/** One sentence for screen readers: "69% of KPI values approved: Environment 81%, Social 62%, Governance 55%." */
export function readinessSentence(r: NonNullable<Summary["readiness"]>): string {
  const pillars = (Object.keys(r.by_pillar) as (keyof typeof r.by_pillar)[]).map((p) => {
    const v = r.by_pillar[p];
    return v === null ? `${PILLAR_LABEL[p]} not counted yet` : `${PILLAR_LABEL[p]} ${formatNumber(v, 0)}%`;
  });
  return `${formatNumber(r.pct, 0)}% of KPI values approved: ${pillars.join(", ")}.`;
}

/** "12 entries and 3 KPI values waiting for approval aren't in these figures." (05-ux §3) */
export function pendingSentence(p: { emissions: number; kpi_values: number }): string | null {
  const parts = [p.emissions > 0 ? `${formatNumber(p.emissions)} ${p.emissions === 1 ? "entry" : "entries"}` : null, p.kpi_values > 0 ? `${formatNumber(p.kpi_values)} KPI ${p.kpi_values === 1 ? "value" : "values"}` : null].filter(Boolean);
  if (parts.length === 0) return null;
  const many = p.emissions + p.kpi_values > 1;
  return `${parts.join(" and ")} waiting for approval ${many ? "aren't" : "isn't"} in these figures.`;
}
