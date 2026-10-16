/**
 * S3-14 Scope 3 base year: API shapes, reason labels and the sentences the
 * Boundary page, targets page and GHG report share. Pure; unit tested.
 */
import {
  type GhgCategoryNumber,
  type RecalculationReason,
  type RecalculationStatus,
  categoryLabel,
  isGhgCategoryNumber,
} from "./contracts";

/** S3-0's reasons, in the order the screens list them. */
export type RecalcReason = RecalculationReason;
export const RECALC_REASONS: readonly RecalcReason[] = ["error", "methodology", "data_quality", "structural"];

/** Scope 3 Standard §9.3 triggers, in plain words. */
export const RECALC_REASON_LABEL: Record<RecalcReason, string> = {
  error: "Correction of errors",
  methodology: "Change in method or factors",
  data_quality: "Better data",
  structural: "Structural change",
};

export type RecalcStatus = RecalculationStatus;

export const RECALC_STATUS_LABEL: Record<RecalcStatus, string> = {
  proposed: "Pending",
  approved: "Approved",
  dismissed: "Dismissed",
};

export const CHANGE_KIND_LABEL: Record<string, string> = {
  edited: "Entries edited",
  deleted: "Entries deleted",
  added: "Entries added late",
  method: "Method or factor changed",
  replaced: "Entries replaced with better data",
  site_added: "Site joined",
  site_removed: "Site left",
  lease_role: "Lease role changed",
  boundary: "Boundary status changed",
  cat11_assumption: "Use of sold products assumptions changed",
};

export const MIN_NOTE = 5;
export const MIN_BASE_YEAR = 2015;
export const DEFAULT_SIGNIFICANCE = 5;

export interface CategoryTotal {
  n: number | null;
  tco2e: number;
}

export interface BaseYearSnapshot {
  version: number;
  frozen_at: string;
  base_year: number;
  year_type: "CY" | "FY";
  total_tco2e: number;
  categories: CategoryTotal[];
  rows: number;
}

export interface CompanyBaseYear {
  id: number;
  company_id: number;
  scope: string;
  base_year: number;
  year_type: "CY" | "FY";
  significance_pct: number;
  policy_note: string | null;
  rationale: string | null;
  snapshot: BaseYearSnapshot | null;
  updated_at: string;
}

export interface BaseYearChange {
  reason: RecalcReason;
  kind: string;
  n: number | null;
  site_id: number | null;
  rows: number;
  delta_tco2e: number;
}

export interface RecalcEvent {
  id: number;
  reason: RecalcReason;
  status: RecalcStatus;
  affected_years: number[];
  delta_tco2e: number;
  note: string | null;
  before: { total_tco2e: number; categories: CategoryTotal[] } | null;
  after: { total_tco2e: number; categories: CategoryTotal[] } | null;
  changes: BaseYearChange[];
  delta_pct: number | null;
  threshold_tco2e: number | null;
  largest_category: number | null;
  approved_by_name: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface BaseYearDrift {
  delta_tco2e: number;
  delta_pct: number | null;
  threshold_tco2e: number;
  significant: boolean;
  reason: RecalcReason | null;
  largest_category: number | null;
  current: { total_tco2e: number; categories: CategoryTotal[] };
  changes: BaseYearChange[];
}

export interface ApprovedRecalculation {
  reason: RecalcReason;
  delta_tco2e: number;
  note: string | null;
  created_at: string;
}

export interface BaseYearResponse {
  base_year: CompanyBaseYear | null;
  /** Approved recalculations, newest first (the report's Methodology tab). */
  approved_recalculations: ApprovedRecalculation[];
  drift: BaseYearDrift | null;
  open_proposal: RecalcEvent | null;
  can_edit: boolean;
}

export interface BaseYearPreview {
  base_year: number;
  year_type: "CY" | "FY";
  total_tco2e: number;
  categories: CategoryTotal[];
  rows: number;
}

/** Years an Admin can pick: 2015 up to last year, newest first. */
export function baseYearChoices(now: Date): number[] {
  const out: number[] = [];
  for (let y = now.getFullYear() - 1; y >= MIN_BASE_YEAR; y--) out.push(y);
  return out;
}

/** "Category 1 · Purchased goods and services", or "Unmapped". */
export const totalLabel = (n: number | null) => (n !== null && isGhgCategoryNumber(n) ? categoryLabel(n as GhgCategoryNumber) : "Unmapped");

/** "+7.2 %" / "−3 %" (true minus sign). */
export function signedPct(pct: number | null): string {
  if (pct === null) return "—";
  const v = Math.round(pct * 10) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} %`;
}

/** "+600 tCO₂e" / "−12.5 tCO₂e". */
export function signedT(t: number): string {
  const v = Math.round(t * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${abs} tCO₂e`;
}

/** "Base year moved by +7.2 %, above your 5 % threshold, mostly Category 1." */
export function proposalSentence(e: Pick<RecalcEvent, "delta_pct" | "largest_category">, significancePct: number): string {
  const mostly = e.largest_category ? `, mostly Category ${e.largest_category}` : "";
  return `Base year moved by ${signedPct(e.delta_pct)}, above your ${significancePct} % threshold${mostly}.`;
}

/** One row per category with a value before or after: frozen, today and the change. */
export function beforeAfterRows(before: CategoryTotal[], after: CategoryTotal[]) {
  const keys = new Set<number | null>([...before, ...after].map((c) => c.n));
  const val = (list: CategoryTotal[], n: number | null) => list.find((c) => c.n === n)?.tco2e ?? 0;
  return [...keys]
    .map((n) => ({ n, before: val(before, n), after: val(after, n), delta: Math.round((val(after, n) - val(before, n)) * 100) / 100 }))
    .filter((r) => r.before !== 0 || r.after !== 0)
    .sort((a, b) => (a.n ?? 99) - (b.n ?? 99));
}

/** Validation for the freeze form and the approve dialog. */
export function significanceError(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return "Enter a threshold.";
  if (v <= 0 || v > 100) return "Use a threshold between 0 and 100 %.";
  return null;
}

export const noteError = (note: string) => (note.trim().length < MIN_NOTE ? `Write at least ${MIN_NOTE} characters.` : null);

/** "Company base year 2023 (set in Scope 3 settings)"; an FY base year says targets use calendar years. */
export const companyBaseYearNote = (year: number, yearType: "CY" | "FY" = "CY") =>
  yearType === "FY"
    ? `Company base year FY${year} (set in Scope 3 settings; targets use calendar years)`
    : `Company base year ${year} (set in Scope 3 settings)`;
