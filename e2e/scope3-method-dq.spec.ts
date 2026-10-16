import { type Page, type Route, expect, test } from "@playwright/test";

/**
 * S3-3 method and data quality smoke tests (src/lib/scope3/CLAUDE.md). Every
 * API call is answered locally:
 * - a contributor picks "From the amount spent" on a Category 1 form, sees
 *   the live data quality, saves, and the My entries drawer shows the method
 *   and "Poor" (the spec's Playwright case);
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
  { emission_factor_id: 1, emission_category_name: "Aluminium (spend)", factor_value: 0.9, denominator_unit: "USD", year: 2019, factor_type: "eeio_spend", geography: "GLO" },
  { emission_factor_id: 2, emission_category_name: "Aluminium", factor_value: 8.6, denominator_unit: "kg", year: 2025, factor_type: "life_cycle", geography: "BH" },
];
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

async function signIn(page: Page, role: "User" | "Manager", api: Api) {
  const user = { user_id: 7, name: role === "User" ? "Uma User" : "Mia Manager", email: "u@midal.com", sites: [site] };
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
      if (path.endsWith("/user/emissions/batches")) return json([]);
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

test("a contributor saves a spend-based row and the drawer shows the method and Poor", async ({ page }) => {
  const api: Api = { posts: [], lists: [] };
  await signIn(page, "User", api);
  await page.goto("/data/new?site=4&category=21&period=2026-09");

  const row = page.getByRole("region", { name: "Row 1" });
  const cards = row.getByRole("group", { name: "How is row 1 calculated?" });
  // Most specific first, and the default.
  await expect(cards.getByRole("radio")).toHaveCount(3);
  await expect(cards.getByRole("radio", { name: "Supplier's own figure" })).toBeChecked();
  await cards.getByRole("radio", { name: "From the amount spent" }).check();

  await row.getByLabel("Emission category").selectOption("Aluminium (spend)");
  await row.getByRole("textbox", { name: "Amount" }).fill("25000");
  // The spend method offers USD only, and picks it.
  await expect(row.getByLabel("Unit").locator("option:not([value=''])")).toHaveText(["USD (factor unit)"]);
  await expect(row.getByLabel("Unit")).toHaveValue("USD");
  await expect(row.getByText("= 22.50 tCO₂e")).toBeVisible();
  await expect(row.getByTestId("row-dq").getByTestId("dq-badge")).toHaveText("Poor");
  await expect(row.getByTestId("row-dq")).toContainText("Secondary data");

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(api.posts[0]).toMatchObject({ method: "spend_based", activity_data_unit: "USD", site_id: 4, category_id: 21 });
  // The method has its own field; it isn't stored among the entered values on a form without an "@method" formula.
  expect(api.posts[0].activity_data).not.toHaveProperty("@method");
  expect(api.posts[0]).not.toHaveProperty("is_estimate");

  await page.goto("/data/mine");
  await page.getByRole("table", { name: "My entries" }).getByRole("row").filter({ hasText: "Purchased materials" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByTestId("entry-method")).toHaveText("From the amount spent");
  await expect(drawer.getByTestId("dq-badge")).toHaveText("Poor");
  await expect(drawer.getByTestId("dq-badge")).toHaveAttribute("aria-label", /Technology: Poor, Geography: Poor, Time: Poor, Completeness: Good, Reliability: Poor/);
  await expect(drawer.getByText("Secondary data")).toBeVisible();
});

test("a method the form refuses sends the contributor back to the method cards", async ({ page }) => {
  const api: Api = { posts: [], lists: [], refuseOnce: "supplier_specific" };
  await signIn(page, "User", api);
  await page.goto("/data/new?site=4&category=21&period=2026-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption("Aluminium");
  await row.getByRole("textbox", { name: "Amount" }).fill("1000");
  await expect(row.getByLabel("Unit")).toHaveValue("");
  await row.getByLabel("Unit").selectOption("kg");
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

test("a Superadmin picks the methods a Category 1 form offers", async ({ page }) => {
  const puts: unknown[] = [];
  const form = { ...goodsForm, method_options: null, site: { site_id: 4, name: "Bahrain plant" }, category: goods, extra_fields: [], calculation: null };
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
      if (path.endsWith("/admin/columns")) return json([{ pk_id: 1, column_name: "amount", column_type: "number" }]);
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json([]);
    },
  );
  await page.goto("/capture/forms/5?tab=calculation");
  const offered = page.getByTestId("methods-offered");
  await expect(offered).toContainText("Category 1 · Purchased goods and services");
  // Ticked out of order; saved most specific first.
  await offered.getByRole("checkbox", { name: "From the amount spent" }).click();
  await offered.getByRole("checkbox", { name: "Supplier's own figure" }).click();
  await offered.getByLabel("Units for From the amount spent").fill("USD, EUR");
  await page.getByRole("button", { name: "Save form" }).click();
  await expect(page.getByText(/Fix 1 thing before saving/)).toBeVisible();
  await offered.getByLabel("Units for Supplier's own figure").fill("kg");
  // The preview shows the cards contributors will see.
  await expect(page.getByTestId("form-preview").getByRole("radio")).toHaveCount(2);
  await page.getByRole("button", { name: "Save form" }).click();
  await expect.poll(() => puts.length).toBe(1);
  expect((puts[0] as { method_options: unknown }).method_options).toEqual([
    { method: "supplier_specific", units: ["kg"] },
    { method: "spend_based", units: ["USD", "EUR"] },
  ]);
});
