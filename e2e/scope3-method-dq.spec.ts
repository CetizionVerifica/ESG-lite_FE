import { type Page, type Route, expect, test } from "@playwright/test";

/**
 * S3-3 method and data quality smoke tests (src/lib/scope3/CLAUDE.md). Every
 * API call is answered locally:
 * - a contributor (User) gets no method choice and no data quality: the form's
 *   first method is sent, and My entries shows the total only (simple-entry §8, SE-1);
 * - on a company set to full detail (SE-1 `entry_detail = "full"`), the
 *   contributor picks "From the amount spent" on a Category 1 form, sees the
 *   live data quality, saves, and the My entries drawer shows the method and
 *   "Poor" (the spec's Playwright case);
 * - a method the form refuses (METHOD_NOT_ALLOWED) goes back to the cards;
 * - a manager's ledger drawer shows both lines and the filters reach the API;
 * - a Superadmin picks "Methods offered" in the form builder.
 */

const company = { company_id: 1, name: "Midal Cables" };
const goods = { category_id: 21, category_name: "Purchased materials", scope: "Scope 3", ghg_category: 1 };
const site = { site_id: 4, name: "Bahrain plant", company, categories: [goods] };

const methodOptions = [
  { method: "supplier_specific", units: ["kg"] },
  { method: "average_data", units: ["kg"] },
  { method: "spend_based", units: ["USD"] },
];
const goodsForm = { pk_id: 5, config_name: "Purchased materials", columns: [{ pk_id: 1, column_name: "amount", column_type: "number" }], method_options: methodOptions };
// A global spend factor from 2019: technology, geography, time and reliability all poor.
const factors = [
  { emission_factor_id: 1, emission_category_name: "Aluminium (spend)", factor_value: 0.9, denominator_unit: "USD", year: 2019, factor_type: "eeio_spend", geography: "GLO", price_currency: "USD" },
  { emission_factor_id: 2, emission_category_name: "Aluminium", factor_value: 8.6, denominator_unit: "kg", year: 2025, factor_type: "life_cycle", geography: "BH" },
];
const gulf = { supplier_id: 1, name: "Gulf Smelter Co.", country: "BH", email: null };
const gulfFigure = { id: 1, supplier_factor_id: 1, supplier_id: 1, item: "Aluminium", unit: "kg", kgco2e_per_unit: 8.6, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6", source: "manual", evidence_document_id: null, material_factor_id: null, supplier_request_id: null, has_evidence: false };
const pickGulf = async (page: Page) => {
  await page.getByRole("region", { name: "Row 1" }).getByRole("combobox", { name: "Supplier" }).click();
  await page.getByRole("option", { name: "Gulf Smelter Co." }).click();
};
const poor = { technology: 3, geography: 3, time: 3, completeness: 1, reliability: 3, overall: 3, source: "auto" };

const saved = (over: object = {}) => ({
  pk_id: 77,
  activity_data: { amount: "25000", emission_category: "Aluminium (spend)" },
  activity_data_unit: "USD",
  total_emission: 22.5,
  unit: "tCO2e",
  date_of_reporting: "2026-09-30",
  reporting_period: "monthly",
  status: "pending",
  created_at: "2026-10-02T08:00:00.000Z",
  updated_at: "2026-10-02T08:00:00.000Z",
  site: { site_id: 4, name: "Bahrain plant" },
  category: goods,
  method: "spend_based",
  dq: poor,
  data_type: "secondary",
  is_estimate: false,
  ...over,
});

type Api = { posts: Record<string, unknown>[]; lists: URLSearchParams[]; refuseOnce?: string };

/** `fullDetail`: the company is set to show contributors the calculation (SE-1 `entry_detail = "full"`). */
async function signIn(page: Page, role: "User" | "Manager", api: Api, fullDetail = false) {
  const userSite = fullDetail ? { ...site, company: { ...company, entry_detail: "full" } } : site;
  const user = { user_id: 7, name: role === "User" ? "Uma User" : "Mia Manager", email: "u@midal.com", sites: [userSite] };
  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user), role],
  );
  await page.route(
    (url) => url.port !== "4173",
    (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json(null);
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/user/sites/4")) return json({ site_id: 4, name: "Bahrain plant", country: { code: "BH" } });
      if (path.includes("/user/column-configs/site/4/category/21")) return json([goodsForm]);
      if (path.endsWith("/user/emission-factors/site/4/category/21")) return json(factors);
      if (path.includes("/user/units/site/4/category/21")) return json([{ unit_id: 1, unit_name: "kg" }, { unit_id: 2, unit_name: "USD" }]);
      if (path.includes("/user/thresholds/company/")) return json({ threshold_percentage: 5 });
      if (path.includes("/user/documents/emission/")) return json([]);
      if (path.endsWith("/user/audit-logs")) return json([]);
      if (path.endsWith("/user/emissions/period-total")) return json({ total_emission: 0 });
      if (path.endsWith("/fx-rates/currencies")) return json({ currencies: [{ code: "USD", name: "US dollar" }, { code: "INR", name: "Indian rupee" }] });
      if (path.endsWith("/fx-rates")) return json({ currency: "USD", to: "USD", date: "2026-09-30", rate: 1, as_of: "2026-09-30", source: "same currency" });
      if (path.endsWith("/user/emissions/batches")) return json([]);
      // S3-6: the form's first method is "Supplier's own figure", so a row names its supplier.
      if (path.endsWith("/suppliers") && request.method() === "GET")
        return json({ company_id: 1, year: 2026, year_type: "CY", can_edit: false, suppliers: [{ ...gulf, rows_this_year: 0, tco2e: 0, has_factor: true, factor_count: 1, has_facility_data: false, last_request: null }] });
      if (path.endsWith("/suppliers/1")) return json({ supplier: gulf, factors: [gulfFigure], facility_data: [], requests: [], can_edit: false });
      if (/\/user\/emissions\/\d+\/history$/.test(path)) return json({ emission_id: 77, months: [] });
      if (path.endsWith("/user/emissions") && request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        api.posts.push(body);
        if (api.refuseOnce && body.method === api.refuseOnce) {
          api.refuseOnce = undefined;
          return json({ code: "METHOD_NOT_ALLOWED", message: "This calculation method isn't offered for this category. This form offers: Average for the material." }, 400);
        }
        return json({ emission: { pk_id: 77 } }, 201);
      }
      if (path.endsWith("/user/emissions")) {
        api.lists.push(url.searchParams);
        const data = role === "User" && api.posts.length === 0 ? [] : [saved()];
        return json({ data, total: data.length, summary: { total_emission: 22.5, pending_count: data.length, approved_count: 0, rejected_count: 0 } });
      }
      return json({});
    },
  );
}

test("a contributor enters values only: the form's method is sent, no method choice or data quality shown", async ({ page }) => {
  const api: Api = { posts: [], lists: [] };
  await signIn(page, "User", api);
  await page.goto("/data/new?site=4&category=21&period=2026-09");

  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption("Aluminium");
  await row.getByRole("textbox", { name: "Amount" }).fill("1000");
  await row.getByLabel("Unit").selectOption("kg");
  await pickGulf(page);
  // The supplier's own figure, 8.6 kg per kg, without the figure line (reviewers see that).
  await expect(row.getByText("= 8.60 tCO₂e")).toBeVisible();
  await expect(row.getByTestId("supplier-figure")).toHaveCount(0);
  await expect(row.getByRole("group", { name: "How is row 1 calculated?" })).toHaveCount(0);
  await expect(row.getByRole("radio")).toHaveCount(0);
  await expect(row.getByLabel("Calculation method")).toHaveCount(0);
  await expect(row.getByTestId("row-dq")).toHaveCount(0);

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  // The form decides: its first (most specific) method.
  expect(api.posts[0]).toMatchObject({ method: "supplier_specific", supplier_id: 1, site_id: 4, category_id: 21 });

  await page.goto("/data/mine");
  await page.getByRole("table", { name: "My entries" }).getByRole("row").filter({ hasText: "Purchased materials" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Emissions")).toBeVisible();
  await expect(drawer.getByTestId("entry-method")).toHaveCount(0);
  await expect(drawer.getByTestId("dq-badge")).toHaveCount(0);
});

test("on a company set to full detail, a contributor saves a spend-based row and the drawer shows the method and Poor", async ({ page }) => {
  const api: Api = { posts: [], lists: [] };
  await signIn(page, "User", api, true);
  await page.goto("/data/new?site=4&category=21&period=2026-09");

  const row = page.getByRole("region", { name: "Row 1" });
  const cards = row.getByRole("group", { name: "How is row 1 calculated?" });
  // Most specific first, and the default.
  await expect(cards.getByRole("radio")).toHaveCount(3);
  await expect(cards.getByRole("radio", { name: "Supplier's own figure" })).toBeChecked();
  await cards.getByRole("radio", { name: "From the amount spent" }).check();
  // S3-5's spend fields replace the quantity and unit as soon as the spend card is picked.
  await expect(row.getByRole("textbox", { name: "Amount spent", exact: true })).toBeVisible();
  await expect(row.getByRole("textbox", { name: "Amount", exact: true })).toHaveCount(0);

  await row.getByLabel("Emission category").selectOption("Aluminium (spend)");
  await row.getByRole("textbox", { name: "Amount spent", exact: true }).fill("25000");
  await row.getByLabel("Currency").selectOption("USD");
  await expect(row.getByText("= 22.50 tCO₂e")).toBeVisible();
  await expect(row.getByTestId("row-dq").getByTestId("dq-badge")).toHaveText("Poor");
  await expect(row.getByTestId("row-dq")).toContainText("Secondary data");

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(api.posts[0]).toMatchObject({ method: "spend_based", activity_data_unit: "USD", site_id: 4, category_id: 21 });
  // The method also stays in activity_data["@method"], where S3-5 reads it on edits; the spend fields go with it.
  expect(api.posts[0].activity_data).toMatchObject({ "@method": "spend_based", spent_value: "25000", currency: "USD" });
  expect(api.posts[0]).not.toHaveProperty("is_estimate");

  await page.goto("/data/mine");
  await page.getByRole("table", { name: "My entries" }).getByRole("row").filter({ hasText: "Purchased materials" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByTestId("entry-method")).toHaveText("From the amount spent");
  await expect(drawer.getByTestId("dq-badge")).toHaveText("Poor");
  await expect(drawer.getByTestId("dq-badge")).toHaveAttribute("aria-label", /Technology: Poor, Geography: Poor, Time: Poor, Completeness: Good, Reliability: Poor/);
  await expect(drawer.getByText("Secondary data")).toBeVisible();
});

test("on a company set to full detail, a method the form refuses goes back to the method cards", async ({ page }) => {
  const api: Api = { posts: [], lists: [], refuseOnce: "supplier_specific" };
  await signIn(page, "User", api, true);
  await page.goto("/data/new?site=4&category=21&period=2026-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption("Aluminium");
  await row.getByRole("textbox", { name: "Amount" }).fill("1000");
  await expect(row.getByLabel("Unit")).toHaveValue("");
  await row.getByLabel("Unit").selectOption("kg");
  await pickGulf(page);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();

  await expect(page.getByText("1 row uses a method this form doesn't offer")).toBeVisible();
  await page.getByRole("button", { name: "Change the method" }).click();
  const cards = page.getByRole("region", { name: "Row 1" }).getByRole("group", { name: "How is row 1 calculated?" });
  await expect(cards).toContainText("This form offers: Average for the material.");
  await cards.getByRole("radio", { name: "Average for the material" }).check();
  await expect(cards).not.toContainText("This form offers");

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(api.posts.map((b) => b.method)).toEqual(["supplier_specific", "average_data"]);
});

test("a manager sees how an entry was calculated, and filters by method and data quality", async ({ page }) => {
  const api: Api = { posts: [], lists: [] };
  await signIn(page, "Manager", api);
  await page.goto("/data/ledger?method=spend_based&dq=2");
  const table = page.getByRole("table", { name: "Emission entries" });
  await expect(table.locator("tbody tr")).toHaveCount(1);
  const list = api.lists.find((q) => q.get("limit") !== "1");
  expect(list?.get("method")).toBe("spend_based");
  expect(list?.get("dq_max")).toBe("2");

  await table.locator("tbody tr").first().click();
  const drawer = page.getByRole("dialog", { name: "Purchased materials" });
  await expect(drawer.getByTestId("drawer-method")).toHaveText("From the amount spent");
  await expect(drawer.getByTestId("drawer-quality").getByTestId("dq-badge")).toHaveText("Poor");
  await drawer.getByTestId("drawer-quality").getByTestId("dq-badge").focus();
  await expect(page.getByRole("tooltip")).toContainText("Reliability: Poor");
});

test("a Superadmin sets how a Category 1 form is calculated: the record's answer picks the method (SE-3)", async ({ page }) => {
  const puts: unknown[] = [];
  const recordType = { pk_id: 2, column_name: "record_type", column_type: "select" };
  const form = {
    ...goodsForm,
    columns: [...goodsForm.columns, recordType],
    column_options: { "2": [{ id: "invoice", label: "Invoice amount" }, { id: "supplier_figure", label: "Supplier's figure" }] },
    method_options: null,
    site: { site_id: 4, name: "Bahrain plant" },
    category: goods,
    extra_fields: [],
    calculation: null,
  };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify({ name: "Sam Staff", email: "sam@example.com" }));
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user: { name: "Sam Staff" } });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/admin/column-configs/5") && request.method() === "PUT") {
        puts.push(request.postDataJSON());
        return json({ message: "updated", columnConfig: { ...form, ...request.postDataJSON() } });
      }
      if (path.endsWith("/admin/column-configs/5")) return json(form);
      if (path.endsWith("/admin/columns")) return json([{ pk_id: 1, column_name: "amount", column_type: "number" }, recordType]);
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json([]);
    },
  );
  await page.goto("/capture/forms/5?tab=calculation");
  const section = page.getByTestId("method-section");
  await expect(section).toContainText("Category 1 · Purchased goods and services");
  await section.getByRole("radio", { name: "It depends on the record" }).click();
  await section.getByLabel("The question contributors answer").selectOption("record_type");
  // Mapped out of order; offered most specific first.
  await section.getByLabel("Method for Invoice amount").selectOption("spend_based");
  await section.getByLabel("Method for Supplier's figure").selectOption("supplier_specific");
  await section.getByLabel("Units for From the amount spent").fill("USD, EUR");
  await section.getByLabel("Units for Supplier's own figure").fill("kg");
  // The preview shows what contributors see: the question in the client's words, no method choice.
  const preview = page.getByTestId("form-preview");
  const methodRadios = preview.getByRole("radio", { name: /supplier's own figure|amount spent/i });
  await expect(preview.getByLabel("Record Type")).toBeVisible();
  await expect(methodRadios).toHaveCount(0);
  // The reviewer view shows the method cards; back to the contributor view hides them again.
  await preview.getByRole("radio", { name: "Reviewer view" }).click();
  await expect(methodRadios).toHaveCount(2);
  await preview.getByRole("radio", { name: "Contributor view" }).click();
  await expect(methodRadios).toHaveCount(0);
  await page.getByRole("button", { name: "Save form" }).click();
  await expect.poll(() => puts.length).toBe(1);
  const body = puts[0] as { method_options: unknown; method_by_choice: unknown };
  expect(body.method_options).toEqual([
    { method: "supplier_specific", units: ["kg"] },
    { method: "spend_based", units: ["USD", "EUR"] },
  ]);
  expect(body.method_by_choice).toEqual({ column: "record_type", map: { invoice: "spend_based", supplier_figure: "supplier_specific" } });
});

