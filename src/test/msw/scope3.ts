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
 * (categories list, screening, the Scope 3 report), the shape here is a mock
 * the owning module confirms or changes in its own PR.
 */
import { http, HttpResponse } from "msw";
import {
  type BoundaryStatus,
  type CompanyBaseYear,
  type CompanyScope3Category,
  type ConsolidationApproach,
  type Direction,
  type FxRate,
  GHG_CATEGORIES,
  type GhgCategoryNumber,
  type PeriodLock,
  type PutScope3CategoryBody,
  RECALCULATION_REASONS,
  type RecalculationEvent,
  type Scope3ErrorBody,
  type Scope3ErrorCode,
  type Supplier,
  type SupplierFactor,
} from "../../lib/scope3/contracts";

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

/** `GET /reports/ghg/scope3` (mock shape, S3-13 confirms). */
export interface Scope3Report {
  year: number;
  total_tco2e: number;
  categories: { ghg_category: GhgCategoryNumber; status: BoundaryStatus; total_tco2e: number; reason?: string | null }[];
}

const error = (code: Scope3ErrorCode, status: number, message: string) =>
  HttpResponse.json<Scope3ErrorBody>({ code, message }, { status });

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
    mapped_categories: MAPPED[c.n] ?? [],
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
  { id: 1, company_id: COMPANY_ID, reason: "error", affected_years: [2023], approved_by: 4, created_at: "2026-03-14T10:12:00.000Z", status: "applied", note: "Copper rod factor was per tonne, not per kg." },
];

const initialLocks = (): PeriodLock[] => [
  { company_id: COMPANY_ID, site_id: 1, year: 2026, month: 8, locked_by: 4, locked_at: "2026-09-10T08:00:00.000Z" },
];

let categories = initialCategories();
let consolidation: ConsolidationApproach = "operational_control";
let suppliers = initialSuppliers();
let supplierFactors = initialSupplierFactors();
let baseYear = initialBaseYear();
let recalculations = initialRecalculations();
let locks = initialLocks();

/** Restore the sample data (call in beforeEach). */
export function resetScope3Mocks(): void {
  categories = initialCategories();
  consolidation = "operational_control";
  suppliers = initialSuppliers();
  supplierFactors = initialSupplierFactors();
  baseYear = initialBaseYear();
  recalculations = initialRecalculations();
  locks = initialLocks();
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
    if (needsReason(body.status, body.reason)) return error("EXCLUSION_REASON_REQUIRED", 400, "Give a reason for excluding this category.");
    Object.assign(row, { ...body, reason: body.status === "included" ? null : body.reason, updated_at: new Date().toISOString() });
    return HttpResponse.json(row);
  }),
  http.get("*/scope3/category-map", () =>
    HttpResponse.json([
      { category_id: 12, company_id: COMPANY_ID, ghg_category: 4, confidence: 0.86, confirmed_by: null, confirmed_at: null, name: "Courier costs" },
      { category_id: 13, company_id: COMPANY_ID, ghg_category: 6, confidence: 0.64, confirmed_by: null, confirmed_at: null, name: "Hotel nights" },
    ]),
  ),
  http.post("*/scope3/category-map", async ({ request }) => HttpResponse.json({ ...(await request.json() as object), confirmed_by: 4, confirmed_at: new Date().toISOString() })),
  http.put<{ id: string }, { consolidation_approach: ConsolidationApproach }>("*/company/:id/consolidation-approach", async ({ request }) => {
    consolidation = (await request.json()).consolidation_approach;
    return HttpResponse.json({ company_id: COMPANY_ID, consolidation_approach: consolidation });
  }),

  // S3-6 suppliers
  http.get("*/suppliers", () => HttpResponse.json(suppliers)),
  http.post<never, Omit<Supplier, "supplier_id" | "company_id">>("*/suppliers", async ({ request }) => {
    const supplier: Supplier = { supplier_id: Math.max(0, ...suppliers.map((s) => s.supplier_id)) + 1, company_id: COMPANY_ID, ...(await request.json()) };
    suppliers.push(supplier);
    return HttpResponse.json(supplier, { status: 201 });
  }),
  http.put<{ id: string }, Partial<Supplier>>("*/suppliers/:id", async ({ params, request }) => {
    const supplier = suppliers.find((s) => s.supplier_id === Number(params.id));
    if (!supplier) return HttpResponse.json({ message: "Supplier not found" }, { status: 404 });
    Object.assign(supplier, await request.json());
    return HttpResponse.json(supplier);
  }),
  http.get<{ id: string }>("*/suppliers/:id/factors", ({ params }) => HttpResponse.json(supplierFactors.filter((f) => f.supplier_id === Number(params.id)))),
  http.post<{ id: string }, Omit<SupplierFactor, "id" | "company_id" | "supplier_id" | "source">>("*/suppliers/:id/factors", async ({ params, request }) => {
    const body = await request.json();
    if (body.boundary !== "cradle_to_gate") return error("SUPPLIER_FACTOR_BOUNDARY", 422, "A supplier's figure must be cradle-to-gate.");
    const factor: SupplierFactor = { id: supplierFactors.length + 1, company_id: COMPANY_ID, supplier_id: Number(params.id), source: "manual", ...body };
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
  http.post<never, { basis?: string }>("*/scope3/extrapolate", async ({ request }) => {
    const body = await request.json();
    if (!body.basis) return error("EXTRAPOLATION_BASIS_INVALID", 400, "The extrapolation basis isn't valid.");
    return HttpResponse.json({ created: 3, status: "pending" }, { status: 201 });
  }),

  // S3-13 report
  http.get("*/reports/ghg/scope3", ({ request }) => {
    const year = Number(new URL(request.url).searchParams.get("year") ?? 2026);
    const report: Scope3Report = {
      year,
      total_tco2e: 21880,
      categories: categories.map((c) => ({
        ghg_category: c.ghg_category,
        status: c.status,
        reason: c.reason,
        total_tco2e: SCREENING.find((s) => s.ghg_category === c.ghg_category && c.status === "included")?.estimate_tco2e ?? 0,
      })),
    };
    return HttpResponse.json(report);
  }),

  // S3-14 base year
  http.get("*/scope3/base-year", () => HttpResponse.json(baseYear)),
  http.put<never, Omit<CompanyBaseYear, "company_id">>("*/scope3/base-year", async ({ request }) => {
    baseYear = { ...baseYear, ...(await request.json()) };
    return HttpResponse.json(baseYear);
  }),
  http.get("*/scope3/recalculations", () => HttpResponse.json(recalculations)),
  http.post<never, { reason?: string; affected_years?: number[]; note?: string | null }>("*/scope3/recalculations", async ({ request }) => {
    const body = await request.json();
    const reason = RECALCULATION_REASONS.find((r) => r === body.reason);
    if (!reason) return error("RECALCULATION_REASON_REQUIRED", 400, "Give a reason for the recalculation.");
    const event: RecalculationEvent = { id: recalculations.length + 1, company_id: COMPANY_ID, reason, affected_years: body.affected_years ?? [], note: body.note ?? null, status: "proposed", created_at: new Date().toISOString() };
    recalculations.push(event);
    return HttpResponse.json(event, { status: 201 });
  }),

  // S3-15 review: submit drafts, month locks
  http.post<never, { ids?: number[] }>("*/user/emissions/submit", async ({ request }) => {
    const ids = (await request.json()).ids ?? [];
    if (ids.length === 0) return error("NOT_DRAFT", 409, "Only Draft entries can be submitted.");
    return HttpResponse.json({ submitted: ids, status: "pending" });
  }),
  http.get("*/periods/lock", () => HttpResponse.json(locks)),
  http.post<never, { site_id?: number | null; year: number; month?: number | null }>("*/periods/lock", async ({ request }) => {
    const body = await request.json();
    const lock: PeriodLock = { company_id: COMPANY_ID, site_id: body.site_id ?? null, year: body.year, month: body.month ?? null, locked_by: 4, locked_at: new Date().toISOString() };
    locks.push(lock);
    return HttpResponse.json(lock, { status: 201 });
  }),
  http.post<never, { site_id?: number | null; year: number; month?: number | null; reason?: string }>("*/periods/unlock", async ({ request }) => {
    const body = await request.json();
    if (!body.reason?.trim()) return error("UNLOCK_REASON_REQUIRED", 400, "Give a reason for reopening this month.");
    const lock = locks.find((l) => l.site_id === (body.site_id ?? null) && l.year === body.year && l.month === (body.month ?? null) && !l.reopened_at);
    if (!lock) return HttpResponse.json({ message: "That month isn't locked." }, { status: 404 });
    Object.assign(lock, { reopened_by: 4, reopened_at: new Date().toISOString(), reopened_reason: body.reason });
    return HttpResponse.json(lock);
  }),
];
