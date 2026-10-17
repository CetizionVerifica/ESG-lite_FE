/**
 * Mock handlers for every Scope 3 endpoint of docs/scope3/01-contracts.md §5
 * (S3-0), so a lane can build and test its screens before its backend lands.
 * Sample company: "Acme Cables" (company 1), sites 1 and 2.
 *
 * Use in a test:
 *   const server = setupServer(...scope3Handlers);   // from "msw/node"
 *   beforeEach(() => resetScope3Mocks());
 *
 * Paths match any API origin (`*`). Where §4/§5 give no response shape yet
 * (categories list, screening, the report envelope, plan and survey
 * answers), the shape here is a mock the owning module confirms or changes in
 * its own PR. Report rows follow `Scope3ReportRow` (§5).
 *
 * S3-3 adds the emission rows' method and data quality: `GET /user/emissions`
 * with `method=` / `dq_max=`, `POST /user/emissions` with `method`,
 * `is_estimate` and `METHOD_NOT_ALLOWED`, and the sample Category 1 form's
 * `method_options` (`GET /user/column-configs/site/1/category/11`).
 */
import { http, HttpResponse } from "msw";
import {
  BOUNDARY_STATUSES,
  type BulkApproveBody,
  type CommutingSurveyBody,
  type ExtrapolateBody,
  type Investment,
  type InvestmentsPlanBody,
  type NothingThisMonthBody,
  type ProductSale,
  type PutScreeningInputsBody,
  type Scope3ReportRow,
  type ScreeningInput,
  type SoldProductsPlanBody,
  type UseProfileBody,
  type BoundaryStatus,
  type CategoryGhgMapProposal,
  type CompanyBaseYear,
  type CompanyScope3Category,
  type ConsolidationApproach,
  type Direction,
  type FxRate,
  GHG_CATEGORIES,
  type GhgCategoryNumber,
  type LockPeriodBody,
  type PeriodLock,
  type PostRecalculationBody,
  type PutScope3CategoryBody,
  RECALCULATION_REASONS,
  type RecalculationEvent,
  type Scope3ErrorBody,
  type Scope3ErrorCode,
  type SubmitEmissionsBody,
  type Supplier,
  type SupplierFactor,
  type UnlockPeriodBody,
} from "../../lib/scope3/contracts";
import { type Dq, type MethodOptions, autoDq, dataTypeFor, isMethod, methodLabel, parseDqMax } from "../../lib/scope3/dq";
import type { EmissionData } from "../../services/emissionService";

const COMPANY_ID = 1;

/** `GET /scope3/categories` row (mock shape, S3-1 confirms): the category, the company's status and the mapped ESGLite categories. */
export interface Scope3CategoryRow extends CompanyScope3Category {
  key: string;
  name: string;
  direction: Direction;
  mapped_categories: { category_id: number; name: string }[];
}

/** `GET /scope3/screening?year=` row (mock shape, S3-12 confirms). */
export interface ScreeningRow {
  ghg_category: GhgCategoryNumber;
  estimate_tco2e: number;
  share_pct: number;
  suggested_status: BoundaryStatus;
  basis: string;
}

/** `GET /reports/ghg/scope3`: rows per §5 (`Scope3ReportRow`); the envelope is a mock shape S3-13 confirms. */
export interface Scope3Report {
  year: number;
  consolidation_approach: ConsolidationApproach;
  gwp_sets: ("AR4" | "AR5" | "AR6")[];
  total_tco2e: number;
  rows: Scope3ReportRow[];
}

const error = (code: Scope3ErrorCode, status: number, message: string) =>
  HttpResponse.json<Scope3ErrorBody>({ code, message }, { status });

/** A body the backend's zod schema refuses: 400 with the problem and no Scope 3 code, as the import endpoints answer. */
const invalid = (path: string, message: string) =>
  HttpResponse.json({ message: "The request body is not valid.", details: [{ path: [path], message }] }, { status: 400 });

const notFound = (message: string) => HttpResponse.json({ message }, { status: 404 });

// ---------------------------------------------------------------------------
// Sample data (realistic, small). resetScope3Mocks() restores it.
// ---------------------------------------------------------------------------

const MAPPED: Partial<Record<GhgCategoryNumber, { category_id: number; name: string }[]>> = {
  1: [{ category_id: 11, name: "Purchased materials" }],
  3: [{ category_id: 5, name: "Fuel and energy related activities" }],
  4: [{ category_id: 7, name: "Inbound freight" }],
  5: [{ category_id: 6, name: "Waste" }],
  6: [{ category_id: 8, name: "Business travel" }],
  7: [{ category_id: 9, name: "Employee commuting" }],
};

const BOUNDARY: Record<GhgCategoryNumber, Pick<CompanyScope3Category, "status" | "reason">> = {
  1: { status: "included" },
  2: { status: "included" },
  3: { status: "included" },
  4: { status: "included" },
  5: { status: "included" },
  6: { status: "included" },
  7: { status: "included" },
  8: { status: "not_relevant", reason: "We own all our buildings." },
  9: { status: "screening" },
  10: { status: "screening" },
  11: { status: "excluded", reason: "Cables use no energy in use; losses sit with the grid operator." },
  12: { status: "screening" },
  13: { status: "not_relevant", reason: "We lease nothing out." },
  14: { status: "not_relevant", reason: "We have no franchises." },
  15: { status: "not_relevant", reason: "No investments outside the group." },
};

const initialCategories = (): Scope3CategoryRow[] =>
  GHG_CATEGORIES.map((c) => ({
    ghg_category: c.n,
    key: c.key,
    name: c.name,
    direction: c.direction,
    ...BOUNDARY[c.n],
    reason: BOUNDARY[c.n].reason ?? null,
    method_note: null,
    relevance: null,
    updated_at: "2026-10-01T09:00:00.000Z",
    mapped_categories: (MAPPED[c.n] ?? []).map((x) => ({ ...x })),
  }));

const initialSuppliers = (): Supplier[] => [
  { supplier_id: 1, company_id: COMPANY_ID, name: "Nordic Aluminium AS", country: "NO", email: "sustainability@nordic-alu.example" },
  { supplier_id: 2, company_id: COMPANY_ID, name: "Gulf Copper Rod LLC", country: "AE", email: null },
];

const initialSupplierFactors = (): SupplierFactor[] => [
  { id: 1, company_id: COMPANY_ID, supplier_id: 1, item: "Aluminium wire rod", unit: "kg", kgco2e_per_unit: 4.2, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6", evidence_document_id: 31, source: "supplier_request" },
  { id: 2, company_id: COMPANY_ID, supplier_id: 2, item: "Copper rod 8 mm", unit: "kg", kgco2e_per_unit: 3.1, boundary: "cradle_to_gate", reference_year: 2024, gwp_set: "AR6", evidence_document_id: null, source: "manual" },
];

const FX_RATES: FxRate[] = [
  { currency: "AED", date: "2026-09-30", rate_to_usd: 0.2723, source: "ECB" },
  { currency: "EUR", date: "2026-09-30", rate_to_usd: 1.1712, source: "ECB" },
  { currency: "INR", date: "2026-09-30", rate_to_usd: 0.0119, source: "ECB" },
];

const SCREENING: ScreeningRow[] = [
  { ghg_category: 1, estimate_tco2e: 18450, share_pct: 71.2, suggested_status: "included", basis: "Spend × EEIO, 2025 purchases" },
  { ghg_category: 4, estimate_tco2e: 2310, share_pct: 8.9, suggested_status: "included", basis: "Spend × EEIO, freight invoices" },
  { ghg_category: 9, estimate_tco2e: 1120, share_pct: 4.3, suggested_status: "included", basis: "Weight × distance, top 10 customers" },
  { ghg_category: 12, estimate_tco2e: 640, share_pct: 2.5, suggested_status: "screening", basis: "Mass sold × landfill factor" },
  { ghg_category: 10, estimate_tco2e: 85, share_pct: 0.3, suggested_status: "not_relevant", basis: "Customers' processing energy, estimate" },
];

const initialBaseYear = (): CompanyBaseYear => ({
  company_id: COMPANY_ID,
  base_year: 2023,
  scope: "Scope 3",
  significance_pct: 5,
  policy_note: "Recalculate when a change moves the base year by 5 % or more.",
  rationale: "First year with full purchase data.",
  year_type: "CY",
});

const initialRecalculations = (): RecalculationEvent[] => [
  { id: 1, company_id: COMPANY_ID, reason: "error", affected_years: [2023], delta_tco2e: -412.6, approved_by: 4, created_at: "2026-03-14T10:12:00.000Z", status: "approved", note: "Copper rod factor was per tonne, not per kg." },
];

const initialLocks = (): PeriodLock[] => [
  { company_id: COMPANY_ID, site_id: 1, year: 2026, month: 8, locked_by: 4, locked_at: "2026-09-10T08:00:00.000Z" },
];

const initialInvestments = (): Investment[] => [
  { id: 1, company_id: COMPANY_ID, investee: "Gulf Cable Services WLL", type: "equity", share_pct: 25, investee_scope12_tco2e: 1840, year: 2025, source: "Investee sustainability report 2025" },
  { id: 2, company_id: COMPANY_ID, investee: "Copper Recyclers Co.", type: "equity", share_pct: 10, revenue: 5_500_000, currency: "USD", eeio_sector: "331420", sector_split: { "331420": 0.6, "562920": 0.4 }, year: 2025 },
];

const initialProductSales = (): ProductSale[] => [
  { id: 1, company_id: COMPANY_ID, product_id: 21, period: "2026-08-01", quantity: 120_000, unit: "m", region: "GCC" },
  { id: 2, company_id: COMPANY_ID, product_id: 22, period: "2026-08-01", quantity: 4_500, unit: "kg", region: "EU" },
];

let categories = initialCategories();
let consolidation: ConsolidationApproach = "operational_control";
let suppliers = initialSuppliers();
let supplierFactors = initialSupplierFactors();
let baseYear = initialBaseYear();
let recalculations = initialRecalculations();
let locks = initialLocks();
let investments = initialInvestments();
let productSales = initialProductSales();

/** S3-3: the sample Category 1 form (site 1 × "Purchased materials", category 11) and what it offers. */
export const CAT1_FORM_METHODS: MethodOptions = [
  { method: "supplier_specific", units: ["kg"] },
  { method: "average_data", units: ["kg", "tonne"] },
  { method: "spend_based", units: ["USD", "EUR"] },
];
const CAT1_FORM = {
  pk_id: 31,
  config_name: "Purchased materials",
  columns: [
    { pk_id: 1, column_name: "material", column_type: "select" },
    { pk_id: 2, column_name: "amount", column_type: "number" },
  ],
  column_options: { "1": [{ id: "aluminium", label: "Aluminium wire rod" }] },
  method_options: CAT1_FORM_METHODS,
};
const CAT1_CATEGORY = { category_id: 11, category_name: "Purchased materials", scope: "Scope 3", ghg_category: 1 };
const SITE_1 = { site_id: 1, name: "Hidd plant" };

/** A row as `GET /user/emissions` returns it, with the S3-3 fields. */
export type MockEmission = EmissionData & { method: string | null; dq: Dq | null; data_type: "primary" | "secondary" | null; is_estimate: boolean };

const factorFor = (method: string) =>
  method === "spend_based" ? { geography: "GLO", year: 2019, factor_type: "eeio_spend" } : method === "supplier_specific" ? { geography: "NO", year: 2025, factor_type: "supplier" } : { geography: "RER", year: 2025, factor_type: "life_cycle" };

const emissionRow = (pk_id: number, method: string | null, amount: number, extra: Partial<MockEmission> = {}): MockEmission => {
  const dq = method && isMethod(method) ? autoDq({ method, factor: factorFor(method), siteCountry: "BH", reportingYear: 2026, hasEvidence: method === "supplier_specific" }) : null;
  return {
    pk_id,
    activity_data: { material: "aluminium", amount: String(amount) },
    total_emission: Math.round(amount * 4.2) / 1000,
    unit: "tCO2e",
    date_of_reporting: "2026-09-30",
    reporting_period: "monthly",
    activity_data_unit: method === "spend_based" ? "USD" : "kg",
    status: "pending",
    created_at: "2026-10-01T09:00:00.000Z",
    updated_at: "2026-10-01T09:00:00.000Z",
    site: SITE_1,
    category: CAT1_CATEGORY,
    method,
    dq,
    data_type: method && isMethod(method) ? dataTypeFor({ method, hasEvidence: method === "supplier_specific" }) : null,
    is_estimate: false,
    ...extra,
  };
};

const initialEmissions = (): MockEmission[] => [
  emissionRow(501, "supplier_specific", 1200),
  emissionRow(502, "average_data", 800),
  emissionRow(503, "spend_based", 25000),
  // A Scope 3 row saved before S3-3, not backfilled yet: no method, no score.
  emissionRow(504, null, 300),
];
let emissions = initialEmissions();
let screeningInputs: ScreeningInput[] = [];
let nothing: NothingThisMonthBody[] = [];

/** Restore the sample data (call in beforeEach). */
export function resetScope3Mocks(): void {
  categories = initialCategories();
  consolidation = "operational_control";
  suppliers = initialSuppliers();
  supplierFactors = initialSupplierFactors();
  baseYear = initialBaseYear();
  recalculations = initialRecalculations();
  locks = initialLocks();
  investments = initialInvestments();
  productSales = initialProductSales();
  screeningInputs = [];
  nothing = [];
  emissions = initialEmissions();
}

const needsReason = (status: BoundaryStatus, reason?: string | null) => status !== "included" && !reason?.trim();

// ---------------------------------------------------------------------------
// Handlers, in §5 order.
// ---------------------------------------------------------------------------

export const scope3Handlers = [
  // S3-1 boundary
  http.get("*/scope3/categories", () => HttpResponse.json(categories)),
  http.put<{ n: string }, PutScope3CategoryBody>("*/scope3/categories/:n", async ({ params, request }) => {
    const n = Number(params.n);
    const row = categories.find((c) => c.ghg_category === n);
    if (!row) return error("GHG_CATEGORY_INVALID", 400, "The GHG Protocol category must be a number from 1 to 15.");
    const body = await request.json();
    if (!BOUNDARY_STATUSES.includes(body.status)) return invalid("status", "Status must be included, excluded, not_relevant or screening.");
    if (needsReason(body.status, body.reason)) return error("EXCLUSION_REASON_REQUIRED", 400, "Give a reason for excluding this category.");
    Object.assign(row, {
      status: body.status,
      reason: body.status === "included" ? null : body.reason,
      method_note: body.method_note ?? row.method_note,
      relevance: body.relevance ?? row.relevance,
      updated_at: new Date().toISOString(),
    });
    return HttpResponse.json(row);
  }),
  http.get("*/scope3/category-map", () =>
    HttpResponse.json([
      { category_id: 12, company_id: COMPANY_ID, ghg_category: 4, confidence: 0.86, confirmed_by: null, confirmed_at: null, name: "Courier costs" },
      { category_id: 13, company_id: COMPANY_ID, ghg_category: 6, confidence: 0.64, confirmed_by: null, confirmed_at: null, name: "Hotel nights" },
    ]),
  ),
  http.post<never, Pick<CategoryGhgMapProposal, "category_id" | "ghg_category">>("*/scope3/category-map", async ({ request }) => {
    const { category_id, ghg_category } = await request.json();
    const proposal: CategoryGhgMapProposal = { category_id, ghg_category, company_id: COMPANY_ID, confidence: 1, confirmed_by: 4, confirmed_at: new Date().toISOString() };
    return HttpResponse.json(proposal);
  }),
  http.put<{ id: string }, { consolidation_approach: ConsolidationApproach }>("*/company/:id/consolidation-approach", async ({ request }) => {
    consolidation = (await request.json()).consolidation_approach;
    return HttpResponse.json({ company_id: COMPANY_ID, consolidation_approach: consolidation });
  }),

  // S3-6 suppliers
  http.get("*/suppliers", () => HttpResponse.json(suppliers)),
  http.post<never, Omit<Supplier, "supplier_id" | "company_id">>("*/suppliers", async ({ request }) => {
    const { name, country, email } = await request.json();
    if (!name?.trim()) return invalid("name", "A supplier needs a name.");
    const supplier: Supplier = { supplier_id: Math.max(0, ...suppliers.map((x) => x.supplier_id)) + 1, company_id: COMPANY_ID, name, country: country ?? null, email: email ?? null, created_by: 4 };
    suppliers.push(supplier);
    return HttpResponse.json(supplier, { status: 201 });
  }),
  http.put<{ id: string }, Partial<Supplier>>("*/suppliers/:id", async ({ params, request }) => {
    const supplier = suppliers.find((s) => s.supplier_id === Number(params.id));
    if (!supplier) return notFound("Supplier not found");
    const { name, country, email } = await request.json();
    if (name !== undefined) supplier.name = name;
    if (country !== undefined) supplier.country = country;
    if (email !== undefined) supplier.email = email;
    return HttpResponse.json(supplier);
  }),
  http.get<{ id: string }>("*/suppliers/:id/factors", ({ params }) =>
    suppliers.some((x) => x.supplier_id === Number(params.id))
      ? HttpResponse.json(supplierFactors.filter((f) => f.supplier_id === Number(params.id)))
      : notFound("Supplier not found"),
  ),
  http.post<{ id: string }, Omit<SupplierFactor, "id" | "company_id" | "supplier_id" | "source">>("*/suppliers/:id/factors", async ({ params, request }) => {
    const supplierId = Number(params.id);
    if (!suppliers.some((x) => x.supplier_id === supplierId)) return notFound("Supplier not found");
    const body = await request.json();
    if (body.boundary !== "cradle_to_gate") return error("SUPPLIER_FACTOR_BOUNDARY", 422, "A supplier's figure must be cradle-to-gate.");
    // Server-owned fields last, so a body can't set them.
    const factor: SupplierFactor = { ...body, id: Math.max(0, ...supplierFactors.map((f) => f.id)) + 1, company_id: COMPANY_ID, supplier_id: supplierId, source: "manual" };
    supplierFactors.push(factor);
    return HttpResponse.json(factor, { status: 201 });
  }),

  // S3-5 FX (read only)
  http.get("*/fx-rates", ({ request }) => {
    const currency = new URL(request.url).searchParams.get("currency") ?? "";
    const rate = FX_RATES.find((r) => r.currency === currency);
    return rate ? HttpResponse.json(rate) : error("CURRENCY_NOT_SUPPORTED", 422, "This currency can't be converted yet.");
  }),

  // S3-12 screening and extrapolation
  http.get("*/scope3/screening", () => HttpResponse.json(SCREENING)),
  http.put<never, Partial<PutScreeningInputsBody>>("*/scope3/screening/inputs", async ({ request }) => {
    const body = await request.json();
    if (!body.year || !Array.isArray(body.inputs)) return invalid("inputs", "Give the year and the inputs.");
    screeningInputs = body.inputs;
    return HttpResponse.json({ year: body.year, inputs: screeningInputs });
  }),
  http.post<never, Partial<ExtrapolateBody>>("*/scope3/extrapolate", async ({ request }) => {
    const body = await request.json();
    const badCoverage = body.basis === "coverage" && !(body.coverage_pct !== undefined && body.coverage_pct >= 1 && body.coverage_pct <= 99);
    if ((body.basis !== "coverage" && body.basis !== "intensity") || badCoverage) {
      return error("EXTRAPOLATION_BASIS_INVALID", 400, "The extrapolation basis isn't valid.");
    }
    return HttpResponse.json({ created: 3, status: "pending" }, { status: 201 });
  }),
  // python_AI_service: EEIO sector suggestions for spend lines (S3-12).
  http.post<never, { lines?: { description: string }[] }>("*/v1/scope3/eeio-sector", async ({ request }) => {
    const lines = (await request.json()).lines ?? [];
    return HttpResponse.json({ lines: lines.map(() => ({ suggestions: [{ code: "331420", confidence: 86 }, { code: "423510", confidence: 41 }] })) });
  }),

  // S3-9 commuting survey → an import plan (mock answer)
  http.post<never, Partial<CommutingSurveyBody>>("*/scope3/commuting/surveys", async ({ request }) => {
    const body = await request.json();
    const responses = body.responses ?? [];
    if (!body.site_id || !body.year || !body.total_employees || responses.length === 0 || responses.length > 20_000) {
      return invalid("responses", "Give the site, year, headcount and 1 to 20,000 responses.");
    }
    const modes = [...new Set(responses.map((r) => r.mode))];
    return HttpResponse.json({ plan_id: 501, rows: modes.length, respondents: responses.length, total_employees: body.total_employees }, { status: 201 });
  }),

  // S3-10 sold products
  http.get("*/scope3/product-sales", () => HttpResponse.json(productSales)),
  http.post<never, Omit<ProductSale, "id" | "company_id">>("*/scope3/product-sales", async ({ request }) => {
    const { product_id, period, quantity, unit, region } = await request.json();
    if (!product_id || !/^\d{4}-\d{2}-01$/.test(period ?? "") || !(quantity > 0) || !unit) return invalid("period", "Give the product, a month (first day), a quantity and a unit.");
    const sale: ProductSale = { id: Math.max(0, ...productSales.map((x) => x.id)) + 1, company_id: COMPANY_ID, product_id, period, quantity, unit, region: region ?? null };
    productSales.push(sale);
    return HttpResponse.json(sale, { status: 201 });
  }),
  http.put<{ id: string }, Partial<ProductSale>>("*/scope3/product-sales/:id", async ({ params, request }) => {
    const sale = productSales.find((x) => x.id === Number(params.id));
    if (!sale) return notFound("Sale not found");
    const { quantity, unit, region, period } = await request.json();
    if (quantity !== undefined) sale.quantity = quantity;
    if (unit !== undefined) sale.unit = unit;
    if (region !== undefined) sale.region = region;
    if (period !== undefined) sale.period = period;
    return HttpResponse.json(sale);
  }),
  http.put<{ id: string }, UseProfileBody>("*/scope3/products/:id/use-profile", async ({ params, request }) => {
    const body = await request.json();
    const mix = body.eol_mix ?? [];
    if (mix.length && Math.abs(mix.reduce((t, x) => t + x.share, 0) - 1) > 1e-6) return invalid("eol_mix", "Treatment shares must add up to 1.");
    return HttpResponse.json({ product_id: Number(params.id), lifetime_uses: body.lifetime_uses ?? null, eol_mix: body.eol_mix ?? null });
  }),
  http.post<never, Partial<SoldProductsPlanBody>>("*/scope3/sold-products/plan", async ({ request }) => {
    const body = await request.json();
    if (!body.site_id || !body.year || ![10, 11, 12].includes(body.ghg_category ?? 0)) return invalid("ghg_category", "Category must be 10, 11 or 12.");
    return HttpResponse.json({ plan_id: 502, rows: productSales.length }, { status: 201 });
  }),

  // S3-11 investments
  http.get("*/scope3/investments", () => HttpResponse.json(investments)),
  http.post<never, Omit<Investment, "id" | "company_id">>("*/scope3/investments", async ({ request }) => {
    const body = await request.json();
    if (!body.investee?.trim() || !(body.share_pct >= 0 && body.share_pct <= 100)) return invalid("share_pct", "Give the investee and a share from 0 to 100 %.");
    const investment: Investment = { ...body, id: Math.max(0, ...investments.map((x) => x.id)) + 1, company_id: COMPANY_ID };
    investments.push(investment);
    return HttpResponse.json(investment, { status: 201 });
  }),
  http.put<{ id: string }, Partial<Investment>>("*/scope3/investments/:id", async ({ params, request }) => {
    const investment = investments.find((x) => x.id === Number(params.id));
    if (!investment) return notFound("Investment not found");
    const changes = await request.json();
    // Server-owned fields stay as they are.
    Object.assign(investment, { ...changes, id: investment.id, company_id: investment.company_id });
    return HttpResponse.json(investment);
  }),
  http.post<never, Partial<InvestmentsPlanBody>>("*/scope3/investments/plan", async ({ request }) => {
    const body = await request.json();
    if (!body.site_id || !body.year) return invalid("year", "Give the site and the year.");
    return HttpResponse.json({ plan_id: 503, rows: investments.length }, { status: 201 });
  }),

  // S3-13 report
  http.get("*/reports/ghg/scope3", ({ request }) => {
    const year = Number(new URL(request.url).searchParams.get("year") ?? 2026);
    // Only included categories carry a total; the report total is their sum.
    const tco2e = (c: Scope3CategoryRow) => (c.status === "included" ? (SCREENING.find((x) => x.ghg_category === c.ghg_category)?.estimate_tco2e ?? 0) : 0);
    const total = categories.reduce((sum, c) => sum + tco2e(c), 0);
    const rows: Scope3ReportRow[] = categories.map((c) => ({
      n: c.ghg_category,
      name: c.name,
      direction: c.direction,
      status: c.status,
      reason: c.reason ?? null,
      method_note: c.method_note ?? null,
      tco2e: tco2e(c),
      share_pct: total ? Math.round((tco2e(c) / total) * 1000) / 10 : 0,
      methods: tco2e(c) ? { spend_based: 100 } : {},
      primary_pct: 0,
      value_chain_pct: 0,
      proxy_pct: 0,
      dq: { overall: tco2e(c) ? 3 : null, good_pct: 0, fair_pct: 0, poor_pct: tco2e(c) ? 100 : 0 },
      datasets: tco2e(c) ? [{ dataset: "USEEIO", version: "2.0", factor_type: "eeio_spend" }] : [],
      gwp_sets: tco2e(c) ? ["AR6"] : [],
      biogenic_tco2e: null,
      mapped_categories: c.mapped_categories,
    }));
    const report: Scope3Report = { year, consolidation_approach: consolidation, gwp_sets: ["AR6"], total_tco2e: total, rows };
    return HttpResponse.json(report);
  }),

  // S3-14 base year
  http.get("*/scope3/base-year", () => HttpResponse.json(baseYear)),
  http.put<never, Omit<CompanyBaseYear, "company_id">>("*/scope3/base-year", async ({ request }) => {
    baseYear = { ...baseYear, ...(await request.json()) };
    return HttpResponse.json(baseYear);
  }),
  http.get("*/scope3/recalculations", () => HttpResponse.json(recalculations)),
  http.post<never, Partial<PostRecalculationBody>>("*/scope3/recalculations", async ({ request }) => {
    const body = await request.json();
    const reason = RECALCULATION_REASONS.find((r) => r === body.reason);
    if (!reason) return error("RECALCULATION_REASON_REQUIRED", 400, "Give a reason for the recalculation.");
    if (!body.affected_years?.length) return invalid("affected_years", "Name at least one affected year.");
    const event: RecalculationEvent = {
      id: Math.max(0, ...recalculations.map((r) => r.id)) + 1,
      company_id: COMPANY_ID,
      reason,
      affected_years: body.affected_years,
      delta_tco2e: 0,
      note: body.note ?? null,
      status: "proposed",
      created_at: new Date().toISOString(),
    };
    recalculations.push(event);
    return HttpResponse.json(event, { status: 201 });
  }),

  // S3-15 review: submit drafts, month locks
  http.post<never, Partial<SubmitEmissionsBody>>("*/user/emissions/submit", async ({ request }) => {
    const ids = (await request.json()).ids ?? [];
    if (ids.length === 0) return invalid("ids", "Choose at least one entry.");
    return HttpResponse.json({ submitted: ids, status: "pending" });
  }),
  http.get("*/periods/lock", () => HttpResponse.json(locks)),
  http.post<never, Partial<LockPeriodBody>>("*/periods/lock", async ({ request }) => {
    const body = await request.json();
    if (!body.year) return invalid("year", "Give the year to lock.");
    const year = body.year;
    const same = (l: PeriodLock) => l.site_id === (body.site_id ?? null) && l.year === year && l.month === (body.month ?? null) && !l.reopened_at;
    if (locks.some(same)) return error("PERIOD_LOCKED", 409, "This month is closed. Reopen it with a reason to change its data.");
    const lock: PeriodLock = { company_id: COMPANY_ID, site_id: body.site_id ?? null, year, month: body.month ?? null, locked_by: 4, locked_at: new Date().toISOString() };
    locks.push(lock);
    return HttpResponse.json(lock, { status: 201 });
  }),
  http.post<never, Partial<UnlockPeriodBody>>("*/periods/unlock", async ({ request }) => {
    const body = await request.json();
    if (!body.reason?.trim()) return error("UNLOCK_REASON_REQUIRED", 400, "Give a reason for reopening this month.");
    const lock = locks.find((l) => l.site_id === (body.site_id ?? null) && l.year === body.year && l.month === (body.month ?? null) && !l.reopened_at);
    if (!lock) return notFound("That month isn't locked.");
    Object.assign(lock, { reopened_by: 4, reopened_at: new Date().toISOString(), reopened_reason: body.reason });
    return HttpResponse.json(lock);
  }),

  http.put<never, Partial<BulkApproveBody>>("*/user/emissions/bulk-approve", async ({ request }) => {
    const body = await request.json();
    const ids = body.ids ?? [];
    if (ids.length === 0) return invalid("ids", "Choose at least one entry.");
    // Sample rule: even ids are ready, odd ids still have a check held.
    const notReady = body.only_ready ? ids.filter((x) => x % 2 === 1) : [];
    return HttpResponse.json({ approved: ids.filter((x) => !notReady.includes(x)), skipped: notReady });
  }),
  http.post<never, { emission_category?: string }>("*/user/emissions/check", () =>
    HttpResponse.json({ ready: false, held: ["EVIDENCE_ATTACHED"] }),
  ),
  http.get<{ id: string }>("*/user/emissions/:id/history", ({ params, request }) => {
    const months = Number(new URL(request.url).searchParams.get("months") ?? 6);
    return HttpResponse.json({
      emission_id: Number(params.id),
      months: Array.from({ length: months }, (_, i) => ({ month: `2026-${String(9 - i).padStart(2, "0")}-01`, tco2e: 4.2 + (i % 3) * 0.3 })),
    });
  }),
  http.post<never, Partial<NothingThisMonthBody>>("*/user/my-month/nothing", async ({ request }) => {
    const body = await request.json();
    if (!body.site_id || !body.category_id || !/^\d{4}-\d{2}-01$/.test(body.month ?? "")) return invalid("month", "Give the site, category and month (first day).");
    const mark = { site_id: body.site_id, category_id: body.category_id, month: body.month as string };
    nothing.push(mark);
    return HttpResponse.json(mark, { status: 201 });
  }),
  // data-loss-reviewed: a test mock; it removes a "Nothing this month" mark from in-memory sample data, never a real record.
  http.delete("*/user/my-month/nothing", async ({ request }) => {
    const body = (await request.json()) as Partial<NothingThisMonthBody>;
    nothing = nothing.filter((n) => !(n.site_id === body.site_id && n.category_id === body.category_id && n.month === body.month));
    return new HttpResponse(null, { status: 204 });
  }),

  // S3-3 method and data quality on every row
  http.get("*/user/column-configs/site/1/category/11", () => HttpResponse.json([CAT1_FORM])),
  http.get("*/user/emissions", ({ request }) => {
    const q = new URL(request.url).searchParams;
    const method = q.get("method");
    const dqMax = q.get("dq_max");
    // As the backend: an unknown method or a dq_max outside 1-3 is a 400, not an empty list.
    if (method && !isMethod(method)) return HttpResponse.json({ message: "method must be a known calculation method" }, { status: 400 });
    if (dqMax !== null && parseDqMax(dqMax) === null) return HttpResponse.json({ message: "dq_max must be 1, 2 or 3" }, { status: 400 });
    const max = parseDqMax(dqMax);
    // A row with no score has none to meet, so dq_max leaves it out.
    const data = emissions.filter((e) => (!method || e.method === method) && (max === null || (e.dq !== null && e.dq.overall <= max)));
    const sum = (status: string) => data.filter((e) => e.status === status).length;
    return HttpResponse.json({
      data,
      total: data.length,
      summary: { total_emission: data.reduce((t, e) => t + e.total_emission, 0), pending_count: sum("pending"), approved_count: sum("approved"), rejected_count: sum("rejected") },
    });
  }),
  http.post<never, { site_id?: number; category_id?: number; activity_data?: Record<string, unknown>; activity_data_unit?: string; method?: string; is_estimate?: boolean }>(
    "*/user/emissions",
    async ({ request }) => {
      const body = await request.json();
      if (body.method !== undefined && !isMethod(body.method)) {
        return HttpResponse.json({ message: "This calculation method isn't one ESGLite knows.", code: "FIELD_INVALID", field: "method" }, { status: 400 });
      }
      const sampleForm = body.site_id === 1 && body.category_id === 11;
      if (sampleForm && body.method && !CAT1_FORM_METHODS.some((o) => o.method === body.method)) {
        const offered = CAT1_FORM_METHODS.map((o) => methodLabel(o.method)).join(", ");
        return error("METHOD_NOT_ALLOWED", 400, `This calculation method isn't offered for this category. This form offers: ${offered}.`);
      }
      // The engine's method chain: the row's, else the form's first, else average data.
      const method = body.method ?? (sampleForm ? CAT1_FORM_METHODS[0].method : "average_data");
      const row = emissionRow(600 + emissions.length, method, Number(body.activity_data?.amount ?? 0), { is_estimate: body.is_estimate ?? false });
      emissions.push(row);
      return HttpResponse.json({ message: "Emission created", emission: row, warnings: [] }, { status: 201 });
    },
  ),
];
