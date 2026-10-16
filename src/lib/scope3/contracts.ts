/**
 * Scope 3 contracts (S3-0): the frontend copy of ESG-lite
 * `src/scope3/contracts/` (docs/scope3/01-contracts.md §1, §3, §4, §5, §7, §8).
 * Types and the category table only; pages read their words from `labels.ts`.
 *
 * Change the backend contracts first, then this file, in the same module.
 * Factor types and their labels are in `factor.ts` (S3-2).
 */

// ---------------------------------------------------------------------------
// §1 Methods and categories
// ---------------------------------------------------------------------------

export const METHOD_KEYS = [
  "supplier_specific",
  "hybrid",
  "average_data",
  "spend_based",
  "fuel_based",
  "distance_based",
  "site_specific",
  "waste_type_specific",
  "asset_specific",
  "lessor_specific",
  "lessee_specific",
  "direct_use",
  "indirect_use",
  "franchise_specific",
  "investment_specific",
  "project_specific",
  "unknown",
] as const;
export type Method = (typeof METHOD_KEYS)[number];

/** Default plain label per method; a category can word it its own way (see `GHG_CATEGORIES`). */
export const METHOD_LABELS: Record<Method, string> = {
  supplier_specific: "Supplier's own figure",
  hybrid: "Supplier's energy and materials",
  average_data: "Average data",
  spend_based: "From the amount spent",
  fuel_based: "From fuel used",
  distance_based: "Distance travelled",
  site_specific: "Site-specific",
  waste_type_specific: "By waste type and treatment",
  asset_specific: "Asset-specific",
  lessor_specific: "Lessor-specific",
  lessee_specific: "Lessee-specific",
  direct_use: "Direct use (energy, fuel, gases)",
  indirect_use: "Indirect use",
  franchise_specific: "Franchise-specific",
  investment_specific: "Investment-specific",
  project_specific: "Project-specific",
  unknown: "Not recorded",
};

export const GHG_CATEGORY_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export type GhgCategoryNumber = (typeof GHG_CATEGORY_NUMBERS)[number];

export type GhgCategoryKey =
  | "purchased_goods"
  | "capital_goods"
  | "fuel_energy"
  | "upstream_transport"
  | "waste"
  | "business_travel"
  | "employee_commuting"
  | "upstream_leased"
  | "downstream_transport"
  | "processing"
  | "use_of_sold"
  | "end_of_life"
  | "downstream_leased"
  | "franchises"
  | "investments";

export type Direction = "upstream" | "downstream";

export interface MethodOption {
  key: Exclude<Method, "unknown">;
  /** The plain label for this method in this category. */
  label: string;
}

export interface GhgCategory {
  n: GhgCategoryNumber;
  key: GhgCategoryKey;
  /** The GHG Protocol name, exactly. */
  name: string;
  /** A few words for chips and narrow columns. */
  short: string;
  direction: Direction;
  /** Methods offered, most specific first. */
  methods: readonly MethodOption[];
}

const m = (key: MethodOption["key"], label?: string): MethodOption => ({ key, label: label ?? METHOD_LABELS[key] });

const GOODS_METHODS = [m("supplier_specific"), m("hybrid"), m("average_data", "Average for the material"), m("spend_based")] as const;
const TRANSPORT_METHODS = [
  m("fuel_based"),
  m("distance_based", "Weight × distance"),
  m("spend_based"),
  m("site_specific", "Warehouse energy"),
  m("average_data"),
] as const;

/** §1, in category order (the same table as the backend's `GHG_CATEGORIES`). */
export const GHG_CATEGORIES: readonly GhgCategory[] = [
  { n: 1, short: "Purchased goods", key: "purchased_goods", name: "Purchased goods and services", direction: "upstream", methods: GOODS_METHODS },
  { n: 2, short: "Capital goods", key: "capital_goods", name: "Capital goods", direction: "upstream", methods: GOODS_METHODS },
  { n: 3, short: "Fuel and energy", key: "fuel_energy", name: "Fuel- and energy-related activities", direction: "upstream", methods: [m("supplier_specific"), m("average_data")] },
  { n: 4, short: "Upstream transport", key: "upstream_transport", name: "Upstream transportation and distribution", direction: "upstream", methods: TRANSPORT_METHODS },
  { n: 5, short: "Waste", key: "waste", name: "Waste generated in operations", direction: "upstream", methods: [m("supplier_specific"), m("waste_type_specific"), m("average_data")] },
  { n: 6, short: "Business travel", key: "business_travel", name: "Business travel", direction: "upstream", methods: [m("fuel_based"), m("distance_based", "Distance travelled"), m("spend_based")] },
  { n: 7, short: "Commuting", key: "employee_commuting", name: "Employee commuting", direction: "upstream", methods: [m("fuel_based"), m("distance_based"), m("average_data", "Headcount × national average")] },
  { n: 8, short: "Upstream leased", key: "upstream_leased", name: "Upstream leased assets", direction: "upstream", methods: [m("asset_specific"), m("lessor_specific"), m("average_data")] },
  { n: 9, short: "Downstream transport", key: "downstream_transport", name: "Downstream transportation and distribution", direction: "downstream", methods: TRANSPORT_METHODS },
  { n: 10, short: "Processing", key: "processing", name: "Processing of sold products", direction: "downstream", methods: [m("site_specific"), m("average_data")] },
  { n: 11, short: "Use of sold products", key: "use_of_sold", name: "Use of sold products", direction: "downstream", methods: [m("direct_use"), m("indirect_use")] },
  { n: 12, short: "End of life", key: "end_of_life", name: "End-of-life treatment of sold products", direction: "downstream", methods: [m("waste_type_specific"), m("average_data")] },
  { n: 13, short: "Downstream leased", key: "downstream_leased", name: "Downstream leased assets", direction: "downstream", methods: [m("asset_specific"), m("lessee_specific"), m("average_data")] },
  { n: 14, short: "Franchises", key: "franchises", name: "Franchises", direction: "downstream", methods: [m("franchise_specific"), m("average_data")] },
  { n: 15, short: "Investments", key: "investments", name: "Investments", direction: "downstream", methods: [m("investment_specific"), m("average_data"), m("project_specific")] },
];

export const isGhgCategoryNumber = (value: unknown): value is GhgCategoryNumber =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 15;

export function ghgCategory(n: GhgCategoryNumber): GhgCategory;
export function ghgCategory(n: number): GhgCategory | undefined;
export function ghgCategory(n: number): GhgCategory | undefined {
  return GHG_CATEGORIES.find((c) => c.n === n);
}

/** "Category 1 · Purchased goods and services" (pages import it from labels.ts). */
export function categoryLabel(n: number): string {
  const c = ghgCategory(n);
  return c ? `Category ${c.n} · ${c.name}` : `Category ${n}`;
}

/** "Purchased goods". */
export function categoryShortName(n: number): string {
  return ghgCategory(n)?.short ?? `Category ${n}`;
}

export const DIRECTION_LABEL: Record<Direction, string> = { upstream: "Upstream", downstream: "Downstream" };

export const SCOPES = ["Scope 1", "Scope 2", "Scope 3"] as const;
export type Scope = (typeof SCOPES)[number] | null;

export const SCOPE3_SUBS = ["3a_upstream_fuels", "3b_upstream_electricity", "3c_td_losses", "3d_resold_energy"] as const;
export type Scope3Sub = (typeof SCOPE3_SUBS)[number];

// ---------------------------------------------------------------------------
// §3 Data quality
// ---------------------------------------------------------------------------

/** 1 = good, 2 = fair, 3 = poor. */
export type DqScore = 1 | 2 | 3;
export const DQ_INDICATORS = ["technology", "geography", "time", "completeness", "reliability"] as const;
export type DqIndicator = (typeof DQ_INDICATORS)[number];
export type Dq = Record<DqIndicator, DqScore> & { overall: DqScore; source: "auto" | "manual" };
export type DataType = "primary" | "secondary";

// ---------------------------------------------------------------------------
// §4 Boundary, suppliers, base year, review (shapes the API returns)
// ---------------------------------------------------------------------------

export const CONSOLIDATION_APPROACHES = ["operational_control", "equity_share", "financial_control"] as const;
export type ConsolidationApproach = (typeof CONSOLIDATION_APPROACHES)[number];

export const BOUNDARY_STATUSES = ["included", "excluded", "not_relevant", "screening"] as const;
export type BoundaryStatus = (typeof BOUNDARY_STATUSES)[number];

/** `company_scope3_category` (S3-1). A reason is required unless included. */
export interface CompanyScope3Category {
  ghg_category: GhgCategoryNumber;
  status: BoundaryStatus;
  reason?: string | null;
  method_note?: string | null;
  relevance?: Record<string, boolean> | null;
  updated_by?: number | null;
  updated_at?: string;
}

/** `PUT /scope3/categories/:n` body (S3-1). */
export interface PutScope3CategoryBody {
  status: BoundaryStatus;
  reason?: string | null;
  method_note?: string | null;
  relevance?: Record<string, boolean>;
}

export interface Supplier {
  supplier_id: number;
  company_id: number;
  name: string;
  country?: string | null;
  email?: string | null;
  created_by?: number;
}

export interface SupplierFactor {
  id: number;
  company_id: number;
  supplier_id: number;
  item: string;
  unit: string;
  kgco2e_per_unit: number;
  boundary: "cradle_to_gate";
  reference_year: number;
  gwp_set: "AR4" | "AR5" | "AR6";
  evidence_document_id?: number | null;
  source: "supplier_request" | "manual";
  /** The PCF material factor it came from, if any. */
  material_factor_id?: number | null;
}

export interface FxRate {
  currency: string;
  date: string;
  rate_to_usd: number;
  source: string;
}

export interface CompanyBaseYear {
  company_id: number;
  base_year: number;
  scope: Scope;
  significance_pct: number;
  policy_note?: string | null;
  rationale?: string | null;
  year_type?: "CY" | "FY" | null;
  /** The base year figures frozen when it was set (S3-14). */
  snapshot?: unknown;
}

export type PutBaseYearBody = Omit<CompanyBaseYear, "company_id" | "snapshot">;

export const RECALCULATION_REASONS = ["methodology", "data_quality", "structural", "error"] as const;
export type RecalculationReason = (typeof RECALCULATION_REASONS)[number];

export interface RecalculationEvent {
  id: number;
  company_id: number;
  reason: RecalculationReason;
  /** At least one year. */
  affected_years: number[];
  /** How much the base year moves, in tCO₂e. */
  delta_tco2e: number;
  approved_by?: number | null;
  created_at?: string;
  status?: RecalculationStatus | null;
  note?: string | null;
  before?: unknown;
  after?: unknown;
}

/** `POST /scope3/recalculations`: a reason and at least one year. */
export interface PostRecalculationBody {
  reason: RecalculationReason;
  affected_years: number[];
  note?: string | null;
}

export const EMISSION_STATUSES = ["draft", "pending", "approved", "rejected"] as const;
export type EmissionStatus = (typeof EMISSION_STATUSES)[number];

/** `period_lock` (S3-15): site null = every site, month null = the whole year. */
export interface PeriodLock {
  company_id: number;
  site_id: number | null;
  year: number;
  month: number | null;
  locked_by: number;
  locked_at: string;
  reopened_by?: number | null;
  reopened_at?: string | null;
  reopened_reason?: string | null;
}

/** `POST /user/emissions/submit` (S3-15): at least one id. */
export interface SubmitEmissionsBody {
  ids: number[];
}

/** `POST /periods/lock`; unlock adds a reason. */
export interface LockPeriodBody {
  site_id?: number | null;
  year: number;
  month?: number | null;
}
export interface UnlockPeriodBody extends LockPeriodBody {
  reason: string;
}

/** `POST /scope3/category-map`: an ESGLite category proposed for a GHG category (S3-1). */
export interface CategoryGhgMapProposal {
  category_id: number;
  company_id: number;
  ghg_category: GhgCategoryNumber;
  confidence: number;
  confirmed_by?: number | null;
  confirmed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Scope 3 fields on an emission row (§4, `GET /user/emissions` gains them)
// ---------------------------------------------------------------------------

export interface Fx {
  currency: string;
  rate: number;
  as_of: string;
  source: string;
}

export interface Proxy {
  basis: string;
  coverage_pct: number;
  from: string;
}

export const GASES = ["CO2", "CH4", "N2O", "HFCs", "PFCs", "SF6", "NF3"] as const;
export type Gas = (typeof GASES)[number];

/** All optional: each module fills its own (S3-3 method, dq, data_type; S3-4 total_kgco2e; …). */
export interface EmissionScope3Fields {
  method?: Method | null;
  dq?: Dq | null;
  data_type?: DataType | null;
  is_estimate?: boolean;
  /** kgCO₂e at 4 dp, a decimal string, beside total_emission (tCO₂e). */
  total_kgco2e?: string | null;
  fx?: Fx | null;
  supplier_id?: number | null;
  scope3_sub?: Scope3Sub | null;
  proxy?: Proxy | null;
  checks?: RowChecks | null;
  gas_kg?: Partial<Record<Gas, number>> | null;
  biogenic_kg?: number | null;
}

// ---------------------------------------------------------------------------
// §7 Error and warning codes, §8 review checks
// ---------------------------------------------------------------------------

export const SCOPE3_ERROR_CODES = [
  "SCOPE_INVALID",
  "GHG_CATEGORY_INVALID",
  "GHG_CATEGORY_REQUIRED",
  "EXCLUSION_REASON_REQUIRED",
  "UNIT_REQUIRED",
  "METHOD_NOT_ALLOWED",
  "CURRENCY_NOT_SUPPORTED",
  "SUPPLIER_FACTOR_BOUNDARY",
  "PERIOD_LOCKED",
  "UNLOCK_REASON_REQUIRED",
  "NOT_DRAFT",
  "EXTRAPOLATION_BASIS_INVALID",
  "PERIOD_INCOMPLETE",
  "BASE_YEAR_NO_DATA",
  "RECALCULATION_REASON_REQUIRED",
] as const;
export type Scope3ErrorCode = (typeof SCOPE3_ERROR_CODES)[number];

/** API error body, as `src/imports/errors.ts` sends it. */
export interface Scope3ErrorBody {
  code: Scope3ErrorCode;
  message: string;
  details?: unknown;
}

export const SCOPE3_WARNING_CODES = [
  "FACTOR_FALLBACK_YEAR",
  "FACTOR_TYPE_MISMATCH",
  "FERA_FACTOR_MISSING",
  "WTT_ALREADY_IN_FACTOR",
  "FX_RATE_FALLBACK",
  "NO_DEFLATOR",
  "DEFLATOR_FALLBACK_YEAR",
  "ESTIMATED_DISTANCE",
  "TRANSPORT_PAID_BY_MISMATCH",
] as const;
export type Scope3WarningCode = (typeof SCOPE3_WARNING_CODES)[number];

export const CHECK_IDS = [
  "FACTOR_FOUND",
  "UNIT_OK",
  "EVIDENCE_ATTACHED",
  "WITHIN_THRESHOLD",
  "NO_DUPLICATE",
  "IMPORT_MATCH_SURE",
  "METHOD_GIVEN",
  "DQ_ACCEPTABLE",
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

/** `emission.checks` (S3-15): ready when nothing is held. */
export interface RowChecks {
  ready: boolean;
  held: CheckId[];
}

// ---------------------------------------------------------------------------
// Shapes folded in from §10 and the module specs (01-contracts.md §4–§6)
// ---------------------------------------------------------------------------

export type YearType = "CY" | "FY";

/** `column_config.method_options` (S3-3): methods a form offers, most specific first, with their units. */
export type MethodOptions = { method: Exclude<Method, "unknown">; units: string[] }[];

export const RECALCULATION_STATUSES = ["proposed", "approved", "dismissed"] as const;
export type RecalculationStatus = (typeof RECALCULATION_STATUSES)[number];

/** `investment` (S3-11). */
export interface Investment {
  id: number;
  company_id: number;
  investee: string;
  type: "equity" | "debt" | "project";
  share_pct: number;
  investee_scope12_tco2e?: number | null;
  year: number;
  source?: string | null;
  revenue?: number | null;
  currency?: string | null;
  eeio_sector?: string | null;
  /** `{sector: share}`, shares summing to 1. */
  sector_split?: Record<string, number> | null;
}

/** `product_sale` (S3-10): `period` is the first day of the month. */
export interface ProductSale {
  id: number;
  company_id: number;
  product_id: number;
  period: string;
  quantity: number;
  unit: string;
  region?: string | null;
}

/** `product.eol_mix`: shares summing to 1. */
export type EolMix = { treatment: string; share: number }[];

/** `PUT /scope3/products/:id/use-profile`. */
export interface UseProfileBody {
  lifetime_uses?: number | null;
  eol_mix?: EolMix | null;
}

export interface InvestmentsPlanBody {
  site_id: number;
  year: number;
  year_type: YearType;
}

export interface SoldProductsPlanBody extends InvestmentsPlanBody {
  ghg_category: 10 | 11 | 12;
}

/** `POST /scope3/commuting/surveys` (S3-9): `ref` is the client's own code, never a name. */
export interface CommutingSurveyBody {
  site_id: number;
  year: number;
  year_type: YearType;
  total_employees: number;
  responses: { ref: string; mode: string; one_way_km: number; days_per_week: number; weeks_per_year: number }[];
}

export const SCREENING_BASES = ["spend", "headcount", "revenue", "mass_sold", "other"] as const;
export type ScreeningBasis = (typeof SCREENING_BASES)[number];

/** `scope3_screening_input` row as `PUT /scope3/screening/inputs` takes it. */
export interface ScreeningInput {
  ghg_category: GhgCategoryNumber;
  basis: ScreeningBasis;
  amount: number;
  currency?: string | null;
  eeio_sector?: string | null;
  note?: string | null;
}

export interface PutScreeningInputsBody {
  year: number;
  inputs: ScreeningInput[];
}

/** `POST /scope3/extrapolate` (S3-12). */
export interface ExtrapolateBody {
  ghg_category: GhgCategoryNumber;
  site_id: number;
  year: number;
  year_type: YearType;
  basis: "coverage" | "intensity";
  /** 1–99; required when basis is "coverage" (ESG-lite schemas.ts refine). */
  coverage_pct?: number;
  source_filter?: Record<string, unknown>;
  output_site_ids?: number[];
}

/** `PUT /user/emissions/bulk-approve` (S3-15). */
export interface BulkApproveBody {
  ids: number[];
  only_ready?: boolean;
}

/** `POST/DELETE /user/my-month/nothing` (S3-15); `month` is the first day of the month. */
export interface NothingThisMonthBody {
  site_id: number;
  category_id: number;
  month: string;
}

/** One row of `GET /reports/ghg/scope3` (S3-13): a category 1–15, or "Unmapped" (`n: null`). */
export interface Scope3ReportRow {
  n: GhgCategoryNumber | null;
  name: string;
  direction: Direction | null;
  status: BoundaryStatus | null;
  reason: string | null;
  method_note: string | null;
  tco2e: number;
  share_pct: number;
  methods: Partial<Record<Method, number>>;
  primary_pct: number;
  value_chain_pct: number;
  proxy_pct: number;
  dq: { overall: number | null; good_pct: number; fair_pct: number; poor_pct: number };
  datasets: { dataset: string; version: string | null; factor_type: string }[];
  gwp_sets: ("AR4" | "AR5" | "AR6")[];
  /** null = "Not tracked" until `emission.biogenic_kg` is written. */
  biogenic_tco2e: number | null;
  mapped_categories: { category_id: number; name: string }[];
}
