/**
 * S3-12 screening page logic (pure, unit tested in logic.test.ts): URL year,
 * input drafts and their validation, relevance ticks, the Apply dialog's
 * draft, and the KPI and row texts. Every figure comes from the server; the
 * page never works out an estimate or a total.
 */
import { BOUNDARY_STATUS_LABEL, type BoundaryStatus, needsReason } from "../../../lib/scope3/boundary";
import type { ExtrapolateBody, ScreeningBasis, ScreeningInput, YearType } from "../../../lib/scope3/contracts";
import { ESTIMATE_NOTE, RELEVANCE_CRITERIA, SCREENING_BASIS_LABEL, SIZE_BASIS_LABEL, isMoneyBasis } from "../../../lib/scope3/screening";
import type { ScreeningCategory } from "../../../services/scope3ScreeningService";

/** The year in `?year=`, or the last completed year (screening is done on a full year). */
export function yearFrom(param: string | null, now = new Date()): number {
  const n = Number(param);
  return Number.isInteger(n) && n >= 1990 && n <= now.getFullYear() + 1 ? n : now.getFullYear() - 1;
}

export const yearTypeFrom = (param: string | null): YearType => (param === "FY" ? "FY" : "CY");

/** The last six years, newest first, plus the chosen one if it is older. */
export function yearOptions(current: number, now = new Date()): number[] {
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  return years.includes(current) ? years : [...years, current].sort((a, b) => b - a);
}

// ── Inputs ────────────────────────────────────────────────────────────────────

export interface InputDraft {
  basis: ScreeningBasis;
  amount: number | null;
  currency: string | null;
  eeio_sector: string | null;
  /** The sector's name, for the picker label only. */
  sector_name: string | null;
  note: string;
}

/** Bases offered for a category: headcount only for Category 7 (the commuting estimate). */
export function basesFor(n: number): ScreeningBasis[] {
  return n === 7 ? ["headcount", "spend", "other"] : ["spend", "revenue", "mass_sold", "other"];
}

export function draftFor(c: ScreeningCategory, basis?: ScreeningBasis): InputDraft {
  const b = basis ?? c.inputs[0]?.basis ?? basesFor(c.n)[0];
  const saved = c.inputs.find((i) => i.basis === b);
  return {
    basis: b,
    amount: saved ? saved.amount : null,
    currency: saved?.currency ?? (isMoneyBasis(b) ? "USD" : null),
    eeio_sector: saved?.eeio_sector ?? null,
    sector_name: saved?.sector?.name ?? null,
    note: saved?.note ?? "",
  };
}

/** What's wrong with a draft, by field; empty when it can be saved. */
export function inputErrors(d: InputDraft): Partial<Record<"amount" | "currency" | "eeio_sector", string>> {
  const e: Partial<Record<"amount" | "currency" | "eeio_sector", string>> = {};
  if (d.amount === null || !Number.isFinite(d.amount)) e.amount = "Enter an amount.";
  else if (d.amount < 0) e.amount = "The amount can't be negative.";
  else if (d.basis === "headcount" && !Number.isInteger(d.amount)) e.amount = "Enter a whole number of employees.";
  if (isMoneyBasis(d.basis) && !d.currency) e.currency = "Choose the currency.";
  return e;
}

export function toInput(n: number, d: InputDraft): ScreeningInput {
  return {
    ghg_category: n as ScreeningInput["ghg_category"],
    basis: d.basis,
    amount: d.amount ?? 0,
    currency: isMoneyBasis(d.basis) ? d.currency : null,
    eeio_sector: isMoneyBasis(d.basis) ? d.eeio_sector : null,
    note: d.note.trim() || null,
  };
}

/** "From the amount spent: add a sector to estimate it." — why a money input has no estimate yet, for the drawer. */
export const missingSectorHint = (d: InputDraft): string | null =>
  isMoneyBasis(d.basis) && !d.eeio_sector ? "Choose a sector so the amount can be turned into an estimate." : null;

// ── Relevance and status ─────────────────────────────────────────────────────

export const tickedLabels = (relevance: Record<string, boolean> | null | undefined): string[] =>
  RELEVANCE_CRITERIA.filter((c) => relevance?.[c.key]).map((c) => c.label);

export const toggleTick = (relevance: Record<string, boolean> | null | undefined, key: string, on: boolean): Record<string, boolean> => {
  const next: Record<string, boolean> = {};
  for (const c of RELEVANCE_CRITERIA) if ((c.key === key ? on : relevance?.[c.key]) === true) next[c.key] = true;
  return next;
};

export interface ApplyDraft {
  status: BoundaryStatus;
  reason: string;
}

/** The Apply dialog starts from the suggestion, with its reason ready to edit. */
export const applyDraftFor = (c: ScreeningCategory): ApplyDraft => ({ status: c.suggestion.status, reason: c.suggestion.reason ?? "" });

export const applyError = (d: ApplyDraft): string | null =>
  needsReason(d.status) && !d.reason.trim() ? `Give a reason for marking it ${BOUNDARY_STATUS_LABEL[d.status].toLowerCase()}.` : null;

/** The suggestion already matches what is saved: nothing to apply. */
export const suggestionApplied = (c: ScreeningCategory): boolean =>
  c.status === c.suggestion.status && (!needsReason(c.status) || (c.reason ?? "").trim() !== "");

// ── Texts ────────────────────────────────────────────────────────────────────

/** "Spend screening · Estimate, not saved" under an estimate. */
export const estimateCaption = (c: ScreeningCategory): string | null =>
  c.estimate_tco2e === null || !c.basis ? null : `${SIZE_BASIS_LABEL[c.basis]} · ${ESTIMATE_NOTE}`;

export const basisLabel = (b: ScreeningBasis) => SCREENING_BASIS_LABEL[b];

/** The share bar's width in % (0–100), never below a visible sliver for a non-zero share. */
export const shareWidth = (pct: number): number => (pct <= 0 ? 0 : Math.min(100, Math.max(2, pct)));

/** "3 of 15" for a KPI hint. */
export const ofFifteen = (n: number) => `${n} of 15`;

// ── Extrapolation ────────────────────────────────────────────────────────────

export interface ExtrapolateDraft {
  site_id: number | null;
  basis: "coverage" | "intensity";
  coverage_pct: number | null;
}

export function extrapolateError(d: ExtrapolateDraft): string | null {
  if (!d.site_id) return "Choose the site.";
  if (d.basis === "coverage" && (d.coverage_pct === null || d.coverage_pct < 1 || d.coverage_pct > 99)) return "Enter the share your recorded rows cover, from 1 to 99 %.";
  return null;
}

export function extrapolateBody(n: number, year: number, yearType: YearType, d: ExtrapolateDraft): ExtrapolateBody {
  return {
    ghg_category: n as ExtrapolateBody["ghg_category"],
    site_id: d.site_id!,
    year,
    year_type: yearType,
    basis: d.basis,
    ...(d.basis === "coverage" ? { coverage_pct: d.coverage_pct! } : { output_site_ids: [d.site_id!] }),
  };
}
