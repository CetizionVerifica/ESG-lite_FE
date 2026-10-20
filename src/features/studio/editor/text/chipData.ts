// DS-7 · what a data chip shows: the server's value for its token (one
// /studio/resolve for the doc, editor/renderInputs.ts), or — for a chip just
// picked and not yet resolved — the value the picker showed (also from the
// server). The FE formats nothing (layer rule 5).
import { createContext, useContext } from "react";
import type { DataToken, Measure, ReportKind, ResolvedBinding, Sites, YearType } from "../../../../lib/studio/contracts";
import { tokenKey, type RenderData } from "../../../../lib/studio/render";
import { UNAVAILABLE_TEXT } from "../../panels/data/logic";

/** A chip's value as the hover card reads it (resolve may send more than the renderer needs). */
export type ChipValue = Pick<ResolvedBinding, "display" | "value" | "unit" | "approvedAt" | "unavailable" | "evidenceCount" | "approvedEntries"> & { source?: ResolvedBinding["source"] };

export interface ChipScope {
  kind: ReportKind;
  year: number;
  yearType: YearType;
  sites: Sites;
}

export interface ChipData {
  scope: ChipScope;
  /** Labels for the hover card ("Scope 1", "Renewable energy share"), by token key. */
  label: (attrs: DataToken["attrs"]) => string | null;
  value: (attrs: DataToken["attrs"]) => ChipValue | null;
  /** What a chip reads as in text (copy, aria): its display, or "Not reported". */
  text: (attrs: DataToken["attrs"]) => string;
}

const primed = new Map<string, { value: ChipValue; label: string }>();

/** Remembers the picker's value and label for a new chip until /resolve answers. */
export function primeChip(attrs: DataToken["attrs"], value: ChipValue, label: string): void {
  primed.set(tokenKey(attrs as never), { value, label });
}
/** Test hook. */
export const resetPrimedChips = (): void => primed.clear();

export function chipText(v: ChipValue | null): string {
  if (!v) return "…";
  if (v.unavailable && v.unavailable.reason !== "EXCLUDED") return "Not reported";
  return v.display;
}

export function makeChipData(scope: ChipScope, data: RenderData | null): ChipData {
  const value = (attrs: DataToken["attrs"]): ChipValue | null => {
    const k = tokenKey(attrs as never);
    return (data?.tokens[k] as ChipValue | undefined) ?? primed.get(k)?.value ?? null;
  };
  return {
    scope,
    value,
    label: (attrs) => primed.get(tokenKey(attrs as never))?.label ?? null,
    text: (attrs) => chipText(value(attrs)),
  };
}

/** The chip data for the text being edited (ChipDataProvider.tsx sets it). */
export const ChipDataContext = createContext<ChipData | null>(null);

export const useChipData = (): ChipData | null => useContext(ChipDataContext);

// ---------------------------------------------------------------------------
// Hover card words (05-ux copy)
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

export const MEASURE_LABELS: Record<DataToken["attrs"]["measure"], string> = {
  value: "Value",
  change_abs: "Change",
  change_pct: "Change %",
  share: "Share",
  progress: "Progress to target",
  target: "Target",
  baseline: "Baseline",
};

const GHG_LABELS: Record<string, string> = {
  total: "Total emissions",
  scope1: "Scope 1",
  scope2_location: "Scope 2 (location-based)",
  scope2_market: "Scope 2 (market-based)",
  scope3: "Scope 3",
  scope3_category: "Scope 3 category",
  biogenic_co2: "Biogenic CO₂ (reported separately)",
  gas_co2: "CO₂",
  gas_ch4: "CH₄",
  gas_n2o: "N₂O",
  gas_other: "Other gases",
  intensity_revenue: "Intensity per unit of revenue",
  intensity_output: "Intensity per unit of output",
  intensity_employee: "Intensity per employee",
  base_year_total: "Base year total",
  dq_score: "Data quality score",
  primary_data_pct: "Primary data share",
  sites_covered: "Sites covered",
  months_covered: "Months covered",
};

/** What the chip is, in words: "Scope 1", "Scope 3 Category 4", a KPI's name or code. */
export function chipName(attrs: DataToken["attrs"], label?: string | null): string {
  if (label) return label;
  const b = attrs.binding;
  if (b.source === "ghg") return b.metric === "scope3_category" && b.scope3Category ? `Scope 3 Category ${b.scope3Category}` : (GHG_LABELS[b.metric] ?? b.metric);
  return b.kpis.join(" + ");
}

/** The hover card's lines: source, period, sites, approval, and the GHG entry count or KPI evidence. */
export function chipCard(attrs: DataToken["attrs"], v: ChipValue | null, scope: ChipScope, label?: string | null): { title: string; value: string; lines: string[] } {
  const b = attrs.binding;
  const sites = b.sites === "all" ? (scope.sites === "all" ? "All sites" : `${scope.sites.length} site${scope.sites.length === 1 ? "" : "s"}`) : `${b.sites.length} site${b.sites.length === 1 ? "" : "s"}`;
  const year = typeof attrs.year === "number" ? attrs.year : attrs.year === "prior" ? scope.year - 1 : scope.year;
  const period = `${scope.yearType === "FY" ? "FY" : "CY"} ${year}${attrs.year === "base" ? " (base year)" : ""}`;
  const lines = [b.source === "ghg" ? "Source: approved emission entries" : "Source: approved KPI values", `Period: ${period}`, `Sites: ${sites}`];
  if (attrs.measure !== "value") lines.push(`Shows: ${MEASURE_LABELS[attrs.measure]}`);
  if (v?.unavailable) lines.push(UNAVAILABLE_TEXT[v.unavailable.reason as keyof typeof UNAVAILABLE_TEXT] ?? "Not reported");
  else {
    const at = day(v?.approvedAt);
    lines.push(at ? `Linked to approved data · ${at}` : v ? "No approved data yet" : "Loading the value…");
  }
  if (b.source === "ghg" && typeof v?.approvedEntries === "number") lines.push(`Approved entries: ${v.approvedEntries.toLocaleString("en-GB")}`);
  if (b.source === "kpi" && typeof v?.evidenceCount === "number") lines.push(`Evidence files: ${v.evidenceCount}`);
  return { title: chipName(attrs, label), value: v ? `${chipText(v)}${v.unit && !v.unavailable ? ` ${v.unit}` : ""}` : "…", lines };
}

/** Attrs after a measure change: a change needs a comparison, so GHG chips compare with the prior year. */
export function withMeasure(attrs: DataToken["attrs"], measure: Measure): DataToken["attrs"] {
  const b = attrs.binding;
  const needsCompare = measure === "change_pct" || measure === "change_abs";
  const binding = needsCompare && !b.compare ? { ...b, compare: "prior" as const } : !needsCompare && measure !== "progress" && measure !== "target" && measure !== "baseline" && b.compare ? (({ compare: _c, ...rest }) => rest)(b) : b;
  return { ...attrs, binding: binding as DataToken["attrs"]["binding"], measure };
}
