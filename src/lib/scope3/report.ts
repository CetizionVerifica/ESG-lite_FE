/**
 * The Scope 3 section of the GHG report (S3-13): the shape of
 * `GET /reports/ghg/scope3` and the labels the Scope 3 and Methodology tabs,
 * the XLSX sheets and the PDF share (ESG-lite src/reporting/ghg-scope3.ts).
 *
 * STAND-IN for the report row S3-0 adds to `contracts.ts` (ESG-lite #144 /
 * S3-0 FE). When it lands, import `Scope3ReportRow` from there and keep the
 * labels and helpers here.
 */
import type { BoundaryStatus } from "./boundary";
import type { GhgCategoryNumber } from "./contracts";
import { methodLabel } from "./methods";

export type FactorType =
  | "combustion"
  | "wtt"
  | "td_loss"
  | "life_cycle"
  | "cradle_to_gate"
  | "eeio_spend"
  | "supplier"
  | "process"
  | "other";
export type GwpSet = "AR4" | "AR5" | "AR6";

export interface Scope3ReportRow {
  /** 1–15, or null for "Unmapped". */
  n: GhgCategoryNumber | null;
  name: string;
  direction: "upstream" | "downstream" | null;
  status: BoundaryStatus | null;
  reason: string | null;
  method_note: string | null;
  tco2e: number;
  share_pct: number;
  /** Method key → % of the category's tCO₂e; `unknown` = not recorded on the entry. */
  methods: Record<string, number>;
  primary_pct: number;
  value_chain_pct: number;
  proxy_pct: number;
  dq: { overall: number | null; good_pct: number; fair_pct: number; poor_pct: number };
  datasets: { dataset: string; version: string | null; factor_type: FactorType }[];
  gwp_sets: GwpSet[];
  /** null = "Not tracked" (the engine doesn't store biogenic CO₂ per entry yet). */
  biogenic_tco2e: number | null;
  mapped_categories: { category_id: number; name: string }[];
  /** Air travel radiative forcing (Standard L4218); null or missing = no flight entries. */
  rf?: "with" | "without" | "mixed" | null;
  /** How extrapolated or proxy data was made; missing on older servers. */
  proxy_basis?: string[];
}

/** "Flights with radiative forcing". */
export const RF_LABEL: Record<"with" | "without" | "mixed", string> = {
  with: "Flights with radiative forcing",
  without: "Flights without radiative forcing",
  mixed: "Flights with and without radiative forcing",
};

export interface Scope3Report {
  company_id: number;
  consolidation_approach: string;
  period: { label: string; year: number; year_type: "CY" | "FY" };
  total_tco2e: number;
  gwp_sets: GwpSet[];
  /** Which inputs entries record yet; false → "Not recorded" / "Not tracked". */
  tracked: { method: boolean; dq: boolean; data_type: boolean; proxy: boolean; biogenic: boolean; gases: boolean; total_kgco2e: boolean };
  rows: Scope3ReportRow[];
}

export const NOT_TRACKED = "Not tracked";
export const NOT_RECORDED = "Not recorded";

export const FACTOR_TYPE_LABEL: Record<FactorType, string> = {
  combustion: "Combustion",
  wtt: "Well-to-tank",
  td_loss: "T&D losses",
  life_cycle: "Life cycle",
  cradle_to_gate: "Cradle-to-gate",
  eeio_spend: "Spend (EEIO)",
  supplier: "Supplier-specific",
  process: "Process",
  other: "Other",
};

/** Data quality words (contracts §3: 1 good, 2 fair, 3 poor). */
export type DqWord = "Good" | "Fair" | "Poor";
export function dqWord(score: number | null | undefined): DqWord | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const r = Math.round(score);
  return r <= 1 ? "Good" : r === 2 ? "Fair" : "Poor";
}

/** "Supplier's own figure 60%, From the amount spent 40%"; "Not recorded" when entries have no method. */
export function methodMixText(row: Scope3ReportRow): string {
  const parts = Object.entries(row.methods)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k === "unknown" ? NOT_RECORDED : methodLabel(k, row.n)} ${Math.round(v)}%`);
  return parts.length ? parts.join(", ") : "—";
}

/** "DEFRA 2025 (life cycle); USEEIO v2 (spend (EEIO))". */
export function datasetText(row: Scope3ReportRow): string {
  return row.datasets.length
    ? row.datasets
        .map((d) => `${d.dataset}${d.version ? ` ${d.version}` : ""} (${FACTOR_TYPE_LABEL[d.factor_type]?.toLowerCase() ?? d.factor_type})`)
        .join("; ")
    : "Factor dataset not recorded";
}

/** "AR6", "AR5 and AR6"; null when no factor records its GWP set. */
export function gwpText(sets: GwpSet[]): string | null {
  if (!sets.length) return null;
  return sets.length === 1 ? sets[0] : `${sets.slice(0, -1).join(", ")} and ${sets[sets.length - 1]}`;
}

/** Report label for a row: "Category 6 · Business travel" or "Unmapped". */
export const rowLabel = (row: Scope3ReportRow) => (row.n === null ? "Unmapped" : `Category ${row.n} · ${row.name}`);

/** Footnote for the by-category table (Scope 3 Standard ch. 11.1). */
export const SCOPE3_TOTAL_NOTE =
  "Gross emissions of CO₂, CH₄, N₂O, HFCs, PFCs and SF₆ in tCO₂e, excluding biogenic CO₂ and not reduced by offsets, allowances or other GHG trades.";
