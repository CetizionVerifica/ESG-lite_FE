import { type Page, type Route, expect, test } from "@playwright/test";

/**
 * S3-6 smoke test: a Manager adds a supplier and its figure on /suppliers; a
 * contributor gets the Supplier field only (simple-entry §8, default (a)) and
 * the save carries the supplier; on a company set to full detail (SE-1) the
 * contributor picks "Supplier's own figure", sees the matched figure and the
 * preview, and the save carries the supplier and the method. /suppliers answers from an in-memory list; the server, not this
 * page, calculates every saved total.
 */

type Fig = { id: number; supplier_factor_id: number; supplier_id: number; item: string; unit: string; kgco2e_per_unit: number; boundary: string; reference_year: number; gwp_set: string; source: string; evidence_document_id: null; material_factor_id: null; supplier_request_id: null; has_evidence: boolean };
type Sup = { supplier_id: number; name: string; country: string | null; email: string | null };

const site = {
  site_id: 4,
  name: "Bahrain plant",
  company: { company_id: 1, name: "Midal Cables" },
  categories: [{ category_id: 21, category_name: "Purchased goods", scope: "Scope 3", ghg_category: 1 }],
};
const config = { pk_id: 5, config_name: "Goods", columns: [{ pk_id: 1, column_name: "quantity", column_type: "number" }] };
const factors = [{ emission_factor_id: 8, emission_category_name: "Aluminium ingot", factor_value: 10, denominator_unit: "kg", year: 2024 }];

/** `saved`: what GET /user/emissions lists once a row is sent (My entries). */
function supplierApi(state: { suppliers: Sup[]; figures: Fig[]; calls: Array<{ method: string; path: string; body: Record<string, unknown> }>; saved?: Record<string, unknown>[] }) {
  return (route: Route, path: string, method: string, body: Record<string, unknown>) => {
    const json = (b: unknown, status = 200) => route.fulfill({ status, json: b });
    if (path.endsWith("/suppliers/coverage")) return json({ from: "2025-01-01", to: "2025-12-31", cat12_tco2e: 0, supplier_specific_tco2e: 0, hybrid_tco2e: 0, coverage_pct: null, top_suppliers: [] });
    if (path.endsWith("/suppliers/name-matches")) return json({ company_id: 1, matches: [] });
    if (path.endsWith("/suppliers") && method === "GET")
      return json({
        company_id: 1,
        year: 2025,
        year_type: "CY",
        can_edit: true,
        suppliers: state.suppliers.map((s) => ({ ...s, rows_this_year: 0, tco2e: 0, has_factor: state.figures.some((f) => f.supplier_id === s.supplier_id), factor_count: 0, has_facility_data: false, last_request: null })),
      });
    if (path.endsWith("/suppliers") && method === "POST") {
      const s: Sup = { supplier_id: state.suppliers.length + 1, name: String(body.name), country: (body.country as string) ?? null, email: (body.email as string) ?? null };
      state.suppliers.push(s);
      return json(s, 201);
    }
    const factorsMatch = /\/suppliers\/(\d+)\/factors$/.exec(path);
    if (factorsMatch && method === "POST") {
      if (body.boundary !== "cradle_to_gate" && body.confirm_boundary !== true) return json({ code: "SUPPLIER_FACTOR_BOUNDARY", message: "A supplier's figure must be cradle-to-gate." }, 422);
      const id = state.figures.length + 1;
      const f: Fig = { ...(body as object), id, supplier_factor_id: id, supplier_id: Number(factorsMatch[1]), source: "manual", evidence_document_id: null, material_factor_id: null, supplier_request_id: null, has_evidence: false } as Fig;
      state.figures.push(f);
      return json(f, 201);
    }
    const detail = /\/suppliers\/(\d+)$/.exec(path);
    if (detail) {
      const s = state.suppliers.find((x) => x.supplier_id === Number(detail[1]));
      return s ? json({ supplier: s, factors: state.figures.filter((f) => f.supplier_id === s.supplier_id), facility_data: [], requests: [], can_edit: true }) : json({ code: "SCOPE3_NOT_FOUND" }, 404);
    }
    return null;
  };
}

/** `fullDetail`: the company shows contributors the calculation (SE-1 `entry_detail = "full"`). */
async function signIn(page: Page, role: "Manager" | "User", state: Parameters<typeof supplierApi>[0], fullDetail = false) {
  const userSite = fullDetail ? { ...site, company: { ...site.company, entry_detail: "full" } } : site;
  const user = role === "User" ? { user_id: 7, name: "Uma User", email: "uma@midal.com", sites: [userSite] } : { user_id: 2, name: "Mona Manager", email: "mona@midal.com", sites: [userSite] };
  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user), role] as const,
  );
  const suppliers = supplierApi(state);
  await page.route(
    (url) => url.port !== "4173",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      const json = (b: unknown, status = 200) => route.fulfill({ status, json: b });
      if (method !== "GET") state.calls.push({ method, path, body });
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json(null);
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.includes("/suppliers")) {
        const handled = suppliers(route, path, method, body);
        if (handled) return handled;
      }
      if (path.includes("/user/column-configs/site/4/category/21")) return json([config]);
      if (path.endsWith("/user/emission-factors/site/4/category/21")) return json(factors);
      if (path.includes("/user/units/site/4/category/")) return json([{ unit_id: 1, unit_name: "kg" }]);
      if (path.includes("/user/category-mappings/")) return json([]);
      if (path.includes("/user/thresholds/company/1")) return json({ threshold_percentage: 5 });
      if (path.endsWith("/user/emissions/period-total")) return json({ total_emission: 0 });
      if (path.endsWith("/user/emissions") && method === "POST") return json({ emission: { pk_id: 501 } }, 201);
      if (path.endsWith("/user/emissions") && method === "GET") {
        const data = state.calls.some((c) => c.method === "POST" && c.path.endsWith("/user/emissions")) ? (state.saved ?? []) : [];
        return json({ data, total: data.length, summary: { total_emission: 0, pending_count: data.length, approved_count: 0, rejected_count: 0 } });
      }
      if (/\/user\/emissions\/\d+\/history$/.test(path)) return json({ emission_id: 501, months: [] });
      if (path.includes("/user/documents/emission/")) return json([]);
      if (path.endsWith("/user/audit-logs")) return json([]);
      return json({});
    },
  );
}

test("a Manager adds a supplier and its cradle-to-gate figure", async ({ page }) => {
  const state = { suppliers: [] as Sup[], figures: [] as Fig[], calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }> };
  await signIn(page, "Manager", state);
  await page.goto("/suppliers");
  await expect(page.getByRole("heading", { name: "Suppliers", level: 1 })).toBeVisible();
  await expect(page.getByText("No suppliers yet.")).toBeVisible();

  await page.getByRole("button", { name: "Add supplier" }).first().click();
  const form = page.getByRole("dialog", { name: "Add supplier" });
  await form.getByLabel("Name").fill("Gulf Smelter Co.");
  await form.getByLabel("Country").fill("ae");
  await form.getByRole("button", { name: "Add supplier" }).click();
  await expect.poll(() => state.calls.find((c) => c.path.endsWith("/suppliers"))?.body).toMatchObject({ name: "Gulf Smelter Co.", country: "AE" });

  // The new supplier's drawer opens; a cradle-to-grave figure needs confirming.
  const drawer = page.getByRole("dialog", { name: "Gulf Smelter Co." });
  await expect(drawer.getByText("No figure from this supplier yet.")).toBeVisible();
  await drawer.getByRole("button", { name: "Add a figure" }).click();
  await drawer.getByLabel("Item").fill("P1020 ingot");
  await drawer.getByRole("textbox", { name: "kgCO₂e per unit" }).fill("8.6");
  await drawer.getByRole("textbox", { name: "Year" }).fill("2025");
  await drawer.getByLabel("Boundary").selectOption("cradle_to_grave");
  await drawer.getByRole("button", { name: "Add figure" }).click();
  await expect(drawer.getByText("This figure isn't cradle-to-gate")).toBeVisible();
  await drawer.getByLabel("Boundary").selectOption("cradle_to_gate");
  await drawer.getByRole("button", { name: "Change it" }).click();
  await drawer.getByRole("button", { name: "Add figure" }).click();
  await expect(drawer.getByRole("list", { name: "Figures" })).toContainText("P1020 ingot");
  await expect(drawer.getByRole("list", { name: "Figures" })).toContainText("8.6 kgCO₂e/kg");
});

test("a contributor gets the Supplier field only: no method choice and no supplier figures", async ({ page }) => {
  const state = {
    suppliers: [{ supplier_id: 1, name: "Gulf Smelter Co.", country: "AE", email: null }] as Sup[],
    figures: [
      { id: 1, supplier_factor_id: 1, supplier_id: 1, item: "P1020 ingot", unit: "kg", kgco2e_per_unit: 8.6, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6", source: "manual", evidence_document_id: null, material_factor_id: null, supplier_request_id: null, has_evidence: true },
    ] as Fig[],
    calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
  };
  await signIn(page, "User", state);
  await page.goto("/data/new?site=4&category=21&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption("Aluminium ingot");
  await row.getByLabel("Quantity").fill("1000");
  await row.getByLabel("Unit").selectOption("kg");
  await row.getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Gulf Smelter Co." }).click();
  // The form decides the method (average data here): 1,000 kg × 10.
  await expect(row.getByText("= 10.000 tCO₂e")).toBeVisible();
  await expect(row.getByLabel("Calculated from")).toHaveCount(0);
  await expect(row.getByTestId("supplier-figure")).toHaveCount(0);
  await expect(row.getByText(/From the supplier's figures/)).toHaveCount(0);

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect.poll(() => state.calls.find((c) => c.path.endsWith("/user/emissions"))?.body).toMatchObject({ supplier_id: 1, category_id: 21 });
  const sent = state.calls.find((c) => c.path.endsWith("/user/emissions"))?.body as Record<string, unknown>;
  expect(sent).not.toHaveProperty("method");
});

test("on a company set to full detail, a contributor enters Category 1 with the supplier's own figure", async ({ page }) => {
  const state = {
    suppliers: [
      { supplier_id: 1, name: "Gulf Smelter Co.", country: "AE", email: null },
      { supplier_id: 2, name: "Nordic Aluminium AS", country: "NO", email: null },
    ] as Sup[],
    figures: [
      { id: 1, supplier_factor_id: 1, supplier_id: 1, item: "P1020 ingot", unit: "kg", kgco2e_per_unit: 8.6, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6", source: "manual", evidence_document_id: null, material_factor_id: null, supplier_request_id: null, has_evidence: true },
    ] as Fig[],
    calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
    // What the server saves: 1,000 kg × 8.6 from the supplier's figure, with evidence on it, so every indicator is Good.
    saved: [
      {
        pk_id: 501,
        activity_data: { quantity: "1000", emission_category: "Aluminium ingot", "@method": "supplier_specific" },
        activity_data_unit: "kg",
        total_emission: 8.6,
        unit: "tCO2e",
        date_of_reporting: "2025-09-30",
        reporting_period: "monthly",
        status: "pending",
        created_at: "2025-10-02T08:00:00.000Z",
        updated_at: "2025-10-02T08:00:00.000Z",
        site: { site_id: 4, name: "Bahrain plant" },
        category: site.categories[0],
        method: "supplier_specific",
        dq: { technology: 1, geography: 1, time: 1, completeness: 1, reliability: 1, overall: 1, source: "auto" },
        data_type: "primary",
        is_estimate: false,
        supplier: { supplier_id: 1, name: "Gulf Smelter Co." },
      },
    ] as Record<string, unknown>[],
  };
  await signIn(page, "User", state, true);
  await page.goto("/data/new?site=4&category=21&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption("Aluminium ingot");
  await row.getByLabel("Quantity").fill("1000");
  await row.getByLabel("Unit").selectOption("kg");
  // Average data until a supplier method is chosen: 1,000 kg × 10.
  await expect(row.getByText("= 10.000 tCO₂e")).toBeVisible();

  // "From the amount spent" switches the row to S3-5's spend fields; a supplier method switches back.
  await row.getByLabel("Calculated from").selectOption("spend_based");
  await expect(row.getByLabel("Amount spent")).toBeVisible();
  // A supplier with no figure: the hint, never an average.
  await row.getByLabel("Calculated from").selectOption("supplier_specific");
  await expect(row.getByLabel("Amount spent")).toHaveCount(0);
  const supplier = row.getByRole("combobox", { name: "Supplier" });
  // A contributor may add a supplier by name.
  await supplier.fill("Bahrain Alloys");
  await page.getByRole("option", { name: "Add “Bahrain Alloys” as a supplier" }).click();
  await expect.poll(() => state.calls.find((c) => c.path.endsWith("/suppliers"))?.body).toEqual({ name: "Bahrain Alloys" });
  await expect(row.getByTestId("supplier-figure-hint")).toBeVisible();
  await supplier.click();
  await page.getByRole("option", { name: "Nordic Aluminium AS" }).click();
  await expect(row.getByTestId("supplier-figure-hint")).toHaveText("No figure from this supplier yet. Request one or use an average.");

  await supplier.click();
  await page.getByRole("option", { name: "Gulf Smelter Co." }).click();
  await expect(row.getByTestId("supplier-figure")).toContainText("Gulf Smelter Co., P1020 ingot, 8.6 kgCO₂e/kg, 2025");
  await expect(row.getByText("= 8.600 tCO₂e")).toBeVisible();

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect.poll(() => state.calls.find((c) => c.path.endsWith("/user/emissions"))?.body).toMatchObject({ method: "supplier_specific", supplier_id: 1, category_id: 21 });
  const sent = state.calls.find((c) => c.path.endsWith("/user/emissions"))?.body as { activity_data: Record<string, unknown> };
  expect(Object.keys(sent.activity_data)).not.toContain("_supplier_id");

  // The spec's Playwright case ends in the entry drawer: the supplier and "Good".
  await page.goto("/data/mine");
  await page.getByRole("table", { name: "My entries" }).getByRole("row").filter({ hasText: "Purchased goods" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByTestId("entry-method")).toHaveText("Supplier's own figure");
  await expect(drawer.getByText("Gulf Smelter Co.")).toBeVisible();
  await expect(drawer.getByTestId("dq-badge")).toHaveText("Good");
  await expect(drawer.getByText("Primary data")).toBeVisible();
});

for (const width of [1280, 1024, 768, 390]) {
  test(`the Suppliers page and drawer fit ${width}px without horizontal scroll`, async ({ page }) => {
    const state = {
      suppliers: [{ supplier_id: 1, name: "Gulf Smelter Co.", country: "AE", email: "pcf@gulf.example" }] as Sup[],
      figures: [] as Fig[],
      calls: [] as Array<{ method: string; path: string; body: Record<string, unknown> }>,
    };
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, "Manager", state);
    await page.goto("/suppliers?supplier=1");
    await expect(page.getByRole("dialog", { name: "Gulf Smelter Co." })).toBeVisible();
    // A Manager's "Request data" opens the C06 flow with the supplier filled in.
    await expect(page.getByRole("link", { name: "Request data" })).toHaveAttribute("href", "/products/suppliers?new=1&supplier=Gulf+Smelter+Co.&email=pcf%40gulf.example");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
