import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import type { Scope3ErrorBody } from "../../lib/scope3/contracts";
import { CAT1_FORM_METHODS, type MockEmission, type Scope3CategoryRow, type Scope3Report, resetScope3Mocks, scope3Handlers } from "./scope3";
import { readMethodOptions } from "../../lib/scope3/dq";

const server = setupServer(...scope3Handlers);
const API = "http://api.test";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetScope3Mocks());
afterAll(() => server.close());

const put = (path: string, body: unknown) =>
  fetch(`${API}${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const post = (path: string, body: unknown) =>
  fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("Scope 3 mock handlers", () => {
  it("lists the 15 categories with the company's status, a reason for each one left out", async () => {
    const rows = (await (await fetch(`${API}/scope3/categories`)).json()) as Scope3CategoryRow[];
    expect(rows.map((r) => r.ghg_category)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    for (const r of rows.filter((x) => x.status === "excluded" || x.status === "not_relevant")) expect(r.reason).toBeTruthy();
  });

  it("refuses to exclude a category without a reason, and saves it with one", async () => {
    const bad = await put("/scope3/categories/2", { status: "excluded" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as Scope3ErrorBody).code).toBe("EXCLUSION_REASON_REQUIRED");

    const ok = await put("/scope3/categories/2", { status: "excluded", reason: "No capital purchases this year." });
    expect(ok.status).toBe(200);
    const rows = (await (await fetch(`${API}/scope3/categories`)).json()) as Scope3CategoryRow[];
    expect(rows.find((r) => r.ghg_category === 2)).toMatchObject({ status: "excluded", reason: "No capital purchases this year." });
  });

  it("starts each test from the sample data", async () => {
    const rows = (await (await fetch(`${API}/scope3/categories`)).json()) as Scope3CategoryRow[];
    expect(rows.find((r) => r.ghg_category === 2)?.status).toBe("included");
  });

  it("only takes cradle-to-gate supplier figures, unless the boundary is confirmed", async () => {
    const bad = await post("/suppliers/1/factors", { item: "Rod", unit: "kg", kgco2e_per_unit: 4, boundary: "cradle_to_grave", reference_year: 2025, gwp_set: "AR6" });
    expect(((await bad.json()) as Scope3ErrorBody).code).toBe("SUPPLIER_FACTOR_BOUNDARY");
    const confirmed = await post("/suppliers/1/factors", { item: "Rod", unit: "kg", kgco2e_per_unit: 4, boundary: "cradle_to_grave", reference_year: 2025, gwp_set: "AR6", confirm_boundary: true });
    expect(confirmed.status).toBe(201);
    const ok = await post("/suppliers/1/factors", { item: "Rod", unit: "kg", kgco2e_per_unit: 4, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6" });
    expect(ok.status).toBe(201);
  });

  it("answers FX, screening, report, base year, recalculation, submit and lock calls", async () => {
    expect((await fetch(`${API}/fx-rates?currency=EUR&date=2026-09-30`)).status).toBe(200);
    expect(((await (await fetch(`${API}/fx-rates?currency=XYZ&date=2026-09-30`)).json()) as Scope3ErrorBody).code).toBe("CURRENCY_NOT_SUPPORTED");
    expect((await fetch(`${API}/scope3/screening?year=2026`)).status).toBe(200);
    expect((await fetch(`${API}/reports/ghg/scope3?year=2026`)).status).toBe(200);
    expect((await fetch(`${API}/scope3/base-year`)).status).toBe(200);
    expect(((await (await post("/scope3/recalculations", { affected_years: [2023] })).json()) as Scope3ErrorBody).code).toBe("RECALCULATION_REASON_REQUIRED");
    expect((await post("/user/emissions/submit", { ids: [1, 2] })).status).toBe(200);
    expect(((await (await post("/periods/unlock", { site_id: 1, year: 2026, month: 8 })).json()) as Scope3ErrorBody).code).toBe("UNLOCK_REASON_REQUIRED");
    expect((await post("/periods/unlock", { site_id: 1, year: 2026, month: 8, reason: "Late invoice" })).status).toBe(200);
  });

  it("refuses bodies the backend would refuse: unknown status, no years, empty submit, missing year", async () => {
    expect((await put("/scope3/categories/2", { status: "foo", reason: "x" })).status).toBe(400);
    expect((await post("/scope3/recalculations", { reason: "error" })).status).toBe(400);
    expect((await post("/user/emissions/submit", { ids: [] })).status).toBe(400);
    expect((await post("/periods/lock", { site_id: 1 })).status).toBe(400);
  });

  it("keeps a report total equal to the sum of its categories, also after a change", async () => {
    const sum = (r: Scope3Report) => r.rows.reduce((t, c) => t + c.tco2e, 0);
    const before = (await (await fetch(`${API}/reports/ghg/scope3?year=2026`)).json()) as Scope3Report;
    expect(before.total_tco2e).toBe(sum(before));
    await put("/scope3/categories/1", { status: "excluded", reason: "Test" });
    const after = (await (await fetch(`${API}/reports/ghg/scope3?year=2026`)).json()) as Scope3Report;
    expect(after.total_tco2e).toBe(sum(after));
    expect(after.total_tco2e).toBeLessThan(before.total_tco2e);
  });

  it("locks a month once; reopening it leaves no active lock", async () => {
    // Locking an already locked site again changes nothing (one lock row per site).
    expect(((await (await post("/periods/lock", { site_id: 1, year: 2026, month: 8 })).json()) as { locked: boolean }).locked).toBe(true);
    await post("/periods/unlock", { site_id: 1, year: 2026, month: 8, reason: "Late invoice" });
    const after = (await (await fetch(`${API}/periods/lock?year=2026&month=8&site_id=1`)).json()) as { sites: { locked: boolean }[] };
    expect(after.sites[0].locked).toBe(false);
    // August has nothing entered, so it can't be locked again until it's complete.
    expect(((await (await post("/periods/lock", { site_id: 1, year: 2026, month: 8 })).json()) as Scope3ErrorBody).code).toBe("PERIOD_INCOMPLETE");
  });

  it("keeps server-owned supplier factor fields and 404s an unknown supplier", async () => {
    const body = { item: "Rod", unit: "kg", kgco2e_per_unit: 4, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6", source: "supplier_request", company_id: 2, id: 99 };
    const made = (await (await post("/suppliers/1/factors", body)).json()) as { id: number; supplier_id: number; source: string };
    expect(made).toMatchObject({ supplier_id: 1, source: "manual" });
    expect(made.id).not.toBe(99);
    expect((await post("/suppliers/999/factors", body)).status).toBe(404);
  });

  it("returns recalculations with how far the base year moved", async () => {
    const events = (await (await fetch(`${API}/scope3/recalculations`)).json()) as { delta_tco2e: number }[];
    expect(typeof events[0].delta_tco2e).toBe("number");
  });

  it("gives report rows in the §5 shape: 15 categories, biogenic not tracked yet", async () => {
    const report = (await (await fetch(`${API}/reports/ghg/scope3?year=2026`)).json()) as Scope3Report;
    expect(report.rows).toHaveLength(15);
    expect(report.rows[0]).toMatchObject({ n: 1, name: "Purchased goods and services", status: "included", biogenic_tco2e: null });
    expect(report.consolidation_approach).toBe("operational_control");
  });

  it("answers the endpoints folded in from the module specs", async () => {
    expect((await put("/scope3/screening/inputs", { year: 2026, inputs: [{ ghg_category: 1, basis: "spend", amount: 1e6, currency: "USD" }] })).status).toBe(200);
    // Inputs are kept per year and year type (ESG-lite #169); CY when left out.
    expect(((await (await put("/scope3/screening/inputs", { year: 2026, year_type: "FY", inputs: [] })).json()) as { year_type: string }).year_type).toBe("FY");
    expect(((await (await put("/scope3/screening/inputs", { year: 2026, inputs: [] })).json()) as { year_type: string }).year_type).toBe("CY");
    expect((await put("/scope3/screening/inputs", { year: 2026, year_type: "QY", inputs: [] })).status).toBe(400);
    expect(((await (await post("/scope3/extrapolate", { ghg_category: 4, site_id: 1, year: 2026, year_type: "CY", basis: "coverage", coverage_pct: 100 })).json()) as Scope3ErrorBody).code).toBe("EXTRAPOLATION_BASIS_INVALID");
    expect((await post("/scope3/extrapolate", { ghg_category: 4, site_id: 1, year: 2026, year_type: "CY", basis: "coverage", coverage_pct: 85 })).status).toBe(201);
    expect((await post("/v1/scope3/eeio-sector", { lines: [{ description: "Copper rod" }], sectors: [] })).status).toBe(200);
    // S3-12 shapes: 15 categories with sizes and suggestions; a dry run shows the formula and saves nothing.
    const screening = (await (await fetch(`${API}/scope3/screening?year=2025`)).json()) as { categories: { n: number; suggestion: { status: string } }[]; sites: unknown[] };
    expect(screening.categories).toHaveLength(15);
    expect(screening.categories.find((c) => c.n === 1)?.suggestion.status).toBe("included");
    expect(screening.sites.length).toBeGreaterThan(0);
    const dry = await post("/scope3/extrapolate?dry_run=1", { ghg_category: 6, site_id: 1, year: 2025, year_type: "CY", basis: "coverage", coverage_pct: 85 });
    expect(dry.status).toBe(200);
    expect(((await dry.json()) as { total_kgco2e: string }).total_kgco2e).toBe("150000.0000");
    expect((await post("/scope3/screening/sector-suggestions", { description: "Flights", amount: 10, currency: "USD" })).status).toBe(200);

    const survey = { site_id: 1, year: 2026, year_type: "CY", total_employees: 3, responses: [{ ref: "A1", mode: "Rail", one_way_km: 10, days_per_week: 5, weeks_per_year: 48 }] };
    expect((await post("/scope3/commuting/surveys", survey)).status).toBe(201);
    expect((await post("/scope3/commuting/surveys", { ...survey, responses: [] })).status).toBe(400);

    expect((await fetch(`${API}/scope3/product-sales`)).status).toBe(200);
    expect((await post("/scope3/product-sales", { product_id: 21, period: "2026-09-15", quantity: 1, unit: "m" })).status).toBe(400);
    expect((await post("/scope3/product-sales", { product_id: 21, period: "2026-09-01", quantity: 1, unit: "m" })).status).toBe(201);
    expect((await put("/scope3/products/21/use-profile", { eol_mix: [{ treatment: "landfill", share: 0.6 }] })).status).toBe(400);
    expect((await post("/scope3/sold-products/plan", { site_id: 1, year: 2026, year_type: "CY", ghg_category: 12 })).status).toBe(201);

    expect((await fetch(`${API}/scope3/investments`)).status).toBe(200);
    expect((await put("/scope3/investments/999", { share_pct: 5 })).status).toBe(404);
    expect((await post("/scope3/investments/plan", { site_id: 1, year: 2026, year_type: "CY" })).status).toBe(201);

    const approve = (await (await put("/user/emissions/bulk-approve", { ids: [2, 3], only_ready: true })).json()) as { approved: number[]; skipped: number[] };
    expect(approve).toEqual({ approved: [2], skipped: [3] });
    expect((await post("/user/emissions/check", { ids: [701] })).status).toBe(200);
    expect(((await (await fetch(`${API}/user/emissions/7/history?months=6`)).json()) as { months: unknown[] }).months).toHaveLength(6);
    expect((await post("/user/my-month/nothing", { site_id: 1, category_id: 2, month: "2026-09-01" })).status).toBe(200);
    const del = await fetch(`${API}/user/my-month/nothing`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ site_id: 1, category_id: 2, month: "2026-09-01" }) });
    expect(del.status).toBe(200);
  });
});

describe("S3-3 method and data quality mocks", () => {
  type List = { data: MockEmission[]; total: number };
  const list = async (query = "") => (await (await fetch(`${API}/user/emissions${query}`)).json()) as List;

  it("returns method, dq, data_type and is_estimate on every row", async () => {
    const { data } = await list();
    expect(data.map((e) => e.method)).toEqual(["supplier_specific", "average_data", "spend_based", null]);
    expect(data[0].dq).toMatchObject({ overall: 1, source: "auto" });
    expect(data[2].dq).toMatchObject({ overall: 3, reliability: 3 });
    expect(data[0].data_type).toBe("primary");
    expect(data[3].dq).toBeNull();
  });

  it("filters by method= and dq_max=, leaving unscored rows out of dq_max, and refuses bad values", async () => {
    expect((await list("?method=spend_based")).data.map((e) => e.pk_id)).toEqual([503]);
    expect((await list("?dq_max=2")).data.map((e) => e.pk_id)).toEqual([501, 502]);
    expect((await list("?dq_max=1")).data.map((e) => e.pk_id)).toEqual([501]);
    expect((await fetch(`${API}/user/emissions?method=spend`)).status).toBe(400);
    expect((await fetch(`${API}/user/emissions?dq_max=4`)).status).toBe(400);
  });

  it("serves the Category 1 form's method_options in the contract shape", async () => {
    const [form] = (await (await fetch(`${API}/user/column-configs/site/1/category/11`)).json()) as { method_options: unknown }[];
    expect(readMethodOptions(form.method_options)).toEqual(CAT1_FORM_METHODS);
  });

  it("saves a method the form offers with its score, and refuses one it doesn't with METHOD_NOT_ALLOWED", async () => {
    const ok = await post("/user/emissions", { site_id: 1, category_id: 11, activity_data: { amount: "1000" }, method: "spend_based", is_estimate: true });
    expect(ok.status).toBe(201);
    const saved = ((await ok.json()) as { emission: MockEmission }).emission;
    expect(saved).toMatchObject({ method: "spend_based", is_estimate: true, data_type: "secondary" });
    expect(saved.dq?.overall).toBe(3);

    const refused = await post("/user/emissions", { site_id: 1, category_id: 11, activity_data: { amount: "1" }, method: "hybrid" });
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as Scope3ErrorBody;
    expect(body.code).toBe("METHOD_NOT_ALLOWED");
    expect(body.message).toMatch(/This form offers: Supplier's own figure, Average data, From the amount spent/);

    const unknown = await post("/user/emissions", { site_id: 1, category_id: 11, activity_data: { amount: "1" }, method: "guess" });
    expect(unknown.status).toBe(400);
    // No method: the form's first, most specific one.
    const fallback = await post("/user/emissions", { site_id: 1, category_id: 11, activity_data: { amount: "1" } });
    expect(((await fallback.json()) as { emission: MockEmission }).emission.method).toBe("supplier_specific");
  });
});
