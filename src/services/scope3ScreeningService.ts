import api from "../api/axios";
import type { BoundaryStatus } from "../lib/scope3/boundary";
import type { Direction, ExtrapolateBody, GhgCategoryNumber, Proxy, ScreeningBasis, ScreeningInput, YearType } from "../lib/scope3/contracts";
import type { SizeBasis } from "../lib/scope3/screening";

/** S3-12 screening and extrapolation (ESG-lite src/scope3/screening). */

export interface ScreeningInputRow extends ScreeningInput {
  updated_at: string | null;
  updated_by: { user_id: number; name: string | null } | null;
  /** The estimate this input gives, or null with a note saying why. */
  estimate_tco2e: number | null;
  estimate_note: string | null;
  sector: { code: string | null; name: string; factor_value: string; price_base_year: number | null } | null;
  fx: { currency: string; to: string; rate: number; as_of: string } | null;
  warnings: string[];
}

export interface ScreeningCategory {
  n: GhgCategoryNumber;
  key: string;
  name: string;
  direction: Direction;
  status: BoundaryStatus;
  reason: string | null;
  relevance: Record<string, boolean>;
  /** Approved + pending rows in the year. */
  recorded_tco2e: number;
  pending_tco2e: number;
  proxy_tco2e: number;
  /** From the screening inputs; never saved as an emission row. */
  estimate_tco2e: number | null;
  basis: "spend" | "revenue" | "headcount" | null;
  size_tco2e: number | null;
  size_basis: SizeBasis | null;
  share_pct: number;
  suggestion: { status: BoundaryStatus; reason: string | null };
  inputs: ScreeningInputRow[];
  mapped_categories: { category_id: number; category_name: string }[];
}

export interface ScreeningSite {
  site_id: number;
  name: string;
  ghg_categories: number[];
}

export interface Screening {
  company_id: number;
  year: number;
  year_type: YearType;
  period: { start: string; end: string };
  sites: ScreeningSite[];
  totals: { recorded_tco2e: number; pending_tco2e: number; estimate_tco2e: number; screened_tco2e: number; included: number; with_reason: number };
  categories: ScreeningCategory[];
  can_edit: boolean;
  can_extrapolate: boolean;
}

export interface SectorSuggestion {
  code: string;
  name: string;
  confidence: number;
  needs_confirmation: boolean;
}

export interface SectorSuggestions {
  available: boolean;
  suggestions: SectorSuggestion[];
  confirm_below: number;
}

export interface LibrarySector {
  emission_factor_id: number;
  name: string;
  factor_value: string;
  unit: string;
  price_base_year: number | null;
}

/** `POST /scope3/extrapolate` answer; `id` only when saved (not on a dry run). */
export interface Extrapolation {
  id?: number;
  status?: "pending";
  dry_run?: boolean;
  ghg_category: GhgCategoryNumber;
  site_id: number;
  category_id: number;
  year: number;
  year_type: YearType;
  basis: "coverage" | "intensity";
  basis_label: string;
  method: string | null;
  formula: string;
  total_kgco2e: string;
  total_tco2e: number;
  proxy: Proxy;
  sources: { rows: number; kg: number; site_ids: number[] };
  production?: { source: number; missing: number; unit: string; output_site_ids: number[] };
}

const withCompany = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export const getScreening = async (companyId: number | null, year: number, yearType: YearType): Promise<Screening> =>
  (await api.get("/scope3/screening", { params: { year, year_type: yearType, ...withCompany(companyId) } })).data;

export const putScreeningInputs = async (companyId: number | null, year: number, inputs: ScreeningInput[]) =>
  (await api.put("/scope3/screening/inputs", { year, inputs, ...withCompany(companyId) })).data as { year: number; inputs: ScreeningInputRow[] };

/** Relevance ticks and "Apply suggestion" go through the S3-1 boundary (Admin and Superadmin). */
export const putCategoryStatus = async (
  companyId: number | null,
  n: number,
  body: { status: BoundaryStatus; reason: string | null; relevance: Record<string, boolean> },
) => (await api.put(`/scope3/categories/${n}`, { ...body, ...withCompany(companyId) })).data;

export const suggestSectors = async (
  companyId: number | null,
  line: { description: string; supplier?: string | null; amount: number; currency: string },
): Promise<SectorSuggestions> => (await api.post("/scope3/screening/sector-suggestions", { ...line, ...withCompany(companyId) })).data;

/** The S3-5 USEEIO library, searched by name (sector picker). */
export const searchSectors = async (q: string): Promise<LibrarySector[]> =>
  ((await api.get("/scope3/spend/library", { params: { q, limit: 50 } })).data?.factors ?? []) as LibrarySector[];

export const extrapolate = async (companyId: number | null, body: ExtrapolateBody, dryRun: boolean): Promise<Extrapolation> =>
  (await api.post("/scope3/extrapolate", { ...body, ...withCompany(companyId) }, { params: dryRun ? { dry_run: 1 } : {} })).data;

export type { ScreeningBasis };
