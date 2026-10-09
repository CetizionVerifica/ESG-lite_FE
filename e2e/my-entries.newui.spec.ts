import { type Page, expect, test } from "@playwright/test";

/**
 * P04 My entries smoke test. Runs against the dev server started with
 * VITE_NEW_UI=1 (project "new-ui"); every API call is answered locally.
 */

const company = { company_id: 3, name: "Glochem" };
const categories = [
  { category_id: 1, category_name: "Diesel", scope: "Scope 1" },
  { category_id: 2, category_name: "Grid electricity", scope: "Scope 2" },
];
const user = { name: "Uma User", email: "uma@example.com", site: { site_id: 7, name: "Hidd plant", company, categories } };
const brand = { companyId: 3, name: "Glochem", primary: "#a01c2c", accent: "#333333", coverFrom: "#a01c2c", coverTo: "#333333", logoUrl: null };

const row = (over: object) => ({
  pk_id: 1,
  activity_data: { emission_category: "Diesel", activity_value: "1000" },
  activity_data_unit: "litre",
  total_emission: 2.68,
  unit: "tCO2e",
  date_of_reporting: "2025-09-30",
  reporting_period: "monthly",
  status: "approved",
  created_at: "2025-10-02T08:00:00.000Z",
  updated_at: "2025-10-02T08:00:00.000Z",
  site: { site_id: 7, name: "Hidd plant" },
  category: categories[0],
  ...over,
});

const rows = [
  row({ pk_id: 41, activity_data: { emission_category: "Diesel", quantity: "1000" }, status: "rejected", review_comment: "Wrong unit, should be litres", reviewed_by: { user_id: 2, name: "Mia Manager" }, reviewed_at: "2025-10-03T09:00:00.000Z" }),
  row({ pk_id: 42, category: categories[1], activity_data: { emission_category: "Grid Electricity", consumption: "25000" }, activity_data_unit: "kwh", total_emission: 12.3, status: "pending" }),
];

const dieselConfig = {
  pk_id: 9,
  config_name: "Diesel",
  columns: [
    { pk_id: 1, column_name: "quantity", column_type: "number" },
    { pk_id: 2, column_name: "emission_category", column_type: "text" },
  ],
};
const dieselFactors = [{ emission_factor_id: 5, emission_category_name: "Diesel", factor_value: 2.68, denominator_unit: "litre", year: 2024 }];

async function signIn(page: Page, requests: URLSearchParams[] = [], saved: { url: string; body: unknown }[] = []) {
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const url = new URL(route.request().url());
      const json = (body: unknown) => route.fulfill({ json: body });
      if (route.request().method() === "PUT" && url.pathname.includes("/user/emissions/")) {
        saved.push({ url: url.pathname, body: route.request().postDataJSON() });
        return json({ message: "Emission updated" });
      }
      if (url.pathname.endsWith("/user/emissions")) {
        requests.push(url.searchParams);
        const status = url.searchParams.get("status");
        const categoryId = Number(url.searchParams.get("categoryId")) || null;
        const data = rows.filter((r) => (!status || r.status === status) && (!categoryId || r.category.category_id === categoryId));
        return json({
          data,
          total: data.length,
          summary: {
            total_emission: data.reduce((s, r) => s + r.total_emission, 0),
            pending_count: data.filter((r) => r.status === "pending").length,
            approved_count: data.filter((r) => r.status === "approved").length,
            rejected_count: data.filter((r) => r.status === "rejected").length,
          },
        });
      }
      if (url.pathname.endsWith("/user/column-configs/site/7/category/1")) return json([dieselConfig]);
      if (url.pathname.includes("/user/column-configs/")) return json([]);
      if (url.pathname.endsWith("/user/emission-factors/site/7/category/1")) return json(dieselFactors);
      if (url.pathname.includes("/user/units/site/7/category/1")) return json([{ unit_name: "litre" }]);
      if (url.pathname.includes("/user/documents/emission/")) return json([]);
      if (url.pathname.includes("/audit-logs")) return json([]);
      if (url.pathname.endsWith("/auth/me")) return json({ role: "User", user });
      if (url.pathname.endsWith("/auth/me/appearance")) return json({ appearance: "system" });
      if (url.pathname.endsWith("/brands/mine")) return json(brand);
      if (url.pathname.endsWith("/notifications/unread")) return json({ count: 0 });
      if (url.pathname.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
}

test("old path redirects; filters are visible and a status figure filters the table", async ({ page }) => {
  const requests: URLSearchParams[] = [];
  await signIn(page, requests);
  await page.goto("/my-emissions");
  await expect(page).toHaveURL(/\/data\/mine/);
  await expect(page.getByRole("heading", { level: 1, name: "My entries" })).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();

  const table = page.getByRole("table", { name: "My entries" });
  await expect(table.getByText("Wrong unit, should be litres")).toBeVisible();
  await expect(table.getByText("Grid electricity", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Rejected: show only these" }).click();
  await expect(page).toHaveURL(/status=rejected/);
  await expect(table.getByText("Grid electricity", { exact: true })).toHaveCount(0);
  expect(requests.some((r) => r.get("status") === "rejected")).toBe(true);
  // The other figures still count every status.
  await expect(page.locator("dl > div").filter({ hasText: "Pending" }).locator("dd").first()).toHaveText("1");
});

test("clear filters empties status, category and period in one go", async ({ page }) => {
  await signIn(page);
  await page.goto("/data/mine?status=rejected&category=2&period=2025-09");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/status=|category=2|period=2025/);
  await expect(page.getByRole("table", { name: "My entries" }).getByText("Grid electricity", { exact: true })).toBeVisible();
});

test("a rejected entry is fixed and resubmitted in the drawer", async ({ page }) => {
  const saved: { url: string; body: unknown }[] = [];
  await signIn(page, [], saved);
  await page.goto("/data/mine");
  await page.getByRole("table", { name: "My entries" }).getByRole("row").filter({ hasText: "Wrong unit" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Fix and resubmit" }).click();

  const quantity = drawer.getByLabel("Quantity");
  await expect(quantity).toHaveValue("1000");
  await quantity.fill("1200");
  await expect(drawer.getByText("= 3.22 tCO₂e")).toBeVisible();

  await drawer.getByRole("button", { name: "Resubmit" }).click();
  await expect(drawer.getByText("Say what you changed so the reviewer can check it.")).toBeVisible();
  expect(saved).toHaveLength(0);

  await drawer.getByLabel("What did you change?").fill("Corrected the litres");
  await drawer.getByRole("button", { name: "Resubmit" }).click();
  await expect(page.getByText("Resubmitted for review")).toBeVisible();
  await expect(drawer).toHaveCount(0);
  expect(saved[0]?.url).toMatch(/\/user\/emissions\/41$/);
  expect(saved[0]?.body).toMatchObject({
    activity_data: { emission_category: "Diesel", quantity: "1200" },
    activity_data_unit: "litre",
    date_of_reporting: "2025-09-30",
    reason: "Corrected the litres",
  });
});

test("a My month link filters by site, category and month; a row opens its drawer", async ({ page }) => {
  const requests: URLSearchParams[] = [];
  await signIn(page, requests);
  await page.goto("/data/mine?site=7&category=1&period=2025-09");
  await expect(page.getByRole("table", { name: "My entries" }).getByText("Wrong unit, should be litres")).toBeVisible();
  const last = requests.at(-1);
  expect(last?.get("categoryId")).toBe("1");
  expect(last?.get("year")).toBe("2025");
  expect(last?.get("month")).toBe("9");

  await page.getByRole("table", { name: "My entries" }).getByRole("row").filter({ hasText: "Wrong unit" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Sent back to you")).toBeVisible();
  await expect(drawer.getByText("No documents attached.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
