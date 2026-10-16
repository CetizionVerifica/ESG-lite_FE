import { type Page, expect, test } from "@playwright/test";

/**
 * S3-5 smoke test: a Category 1 row from the amount spent. Every API call is
 * answered locally; created rows are collected to check what a submit sends.
 */

const site = {
  site_id: 4,
  name: "Bahrain plant",
  company: { company_id: 1, name: "Midal Cables" },
  categories: [{ category_id: 21, category_name: "Purchased goods and services", scope: "Scope 3", ghg_category: 1 }],
};

const config = {
  pk_id: 7,
  config_name: "Purchased goods",
  columns: [
    { pk_id: 1, column_name: "material", column_type: "select" },
    { pk_id: 2, column_name: "quantity", column_type: "number" },
  ],
  column_options: { "1": [{ id: "chemicals", label: "Chemicals" }] },
  emission_category_mapping: { Chemicals: "Chemicals (USEEIO)" },
  // Older Category 1 forms carry these as extra fields; the spend form replaces them.
  extra_fields: [
    { key: "spent_value", label: "Spent value", type: "number", required: false },
    { key: "currency", label: "Spend currency", type: "text", required: false },
  ],
};

// A USEEIO factor copied from the library: per 2022 USD.
const factors = [
  {
    emission_factor_id: 951,
    emission_category_name: "Chemicals (USEEIO)",
    factor_value: 0.42,
    denominator_unit: "USD",
    year: 2025,
    factor_type: "eeio_spend",
    price_currency: "USD",
    price_base_year: 2022,
  },
];

const rate = {
  currency: "INR",
  to: "USD",
  date: "2026-09-03",
  rate: 1 / 88.9,
  as_of: "2026-09-03",
  source: "ecb",
  fallback: false,
  deflator: { country: "US", base_year: 2022, spend_year: 2026, base_index: 292.655, spend_index: 330.2, source: "BLS CPI-U" },
  no_deflator: false,
};

async function signIn(page: Page, created: unknown[], rateQueries: URLSearchParams[], rateStatus = 200) {
  const user = { user_id: 7, name: "Uma User", email: "uma@midal.com", sites: [site] };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4173",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "User", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json(null);
      if (path.includes("/user/column-configs/site/4/category/21")) return json([config]);
      if (path.endsWith("/user/emission-factors/site/4/category/21")) return json(factors);
      if (path.includes("/user/units/site/4/category/")) return json([{ unit_id: 1, unit_name: "USD" }]);
      if (path.includes("/user/category-mappings/")) return json([]);
      if (path.includes("/user/thresholds/company/1")) return json({ threshold_percentage: 5 });
      if (path.endsWith("/user/emissions/period-total")) return json({ total_emission: 0 });
      if (path.endsWith("/fx-rates/currencies")) {
        return json({ currencies: ["INR", "USD", "EUR", "GBP", "BHD", "SAR", "AED"].map((code) => ({ code, name: code === "INR" ? "Indian rupee" : code })) });
      }
      if (path.endsWith("/fx-rates")) {
        rateQueries.push(url.searchParams);
        return rateStatus === 200 ? json(rate) : json({ message: "unavailable" }, rateStatus);
      }
      if (path.endsWith("/user/emissions") && request.method() === "POST") {
        created.push(request.postDataJSON());
        return json({ emission: { pk_id: 300 } }, 201);
      }
      if (path.endsWith("/user/emissions") && request.method() === "GET") {
        return json({ data: [], total: 0, summary: { total_emission: 0, pending_count: 0, approved_count: 0, rejected_count: 0 } });
      }
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
}

test("a Category 1 row from the amount spent shows the rate and deflator, and sends amount, currency and invoice date", async ({ page }) => {
  const created: Record<string, unknown>[] = [];
  const rateQueries: URLSearchParams[] = [];
  await signIn(page, created, rateQueries);
  await page.goto("/data/new?site=4&category=21&period=2026-09");

  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Material").selectOption({ label: "Chemicals" });
  // A spend factor: Amount, Currency and Invoice date replace the quantity and unit.
  await expect(row.getByLabel("Quantity")).toHaveCount(0);
  await expect(row.getByLabel("Unit")).toHaveCount(0);
  await row.getByLabel("Amount spent").fill("1240000");
  await row.getByLabel("Currency").selectOption("INR");
  await row.getByLabel("Invoice date").fill("2026-09-03");
  // The form's older "Spent value" / "Currency" extras aren't shown a second time.
  await expect(row.getByLabel("Spent value")).toHaveCount(0);
  await expect(row.getByLabel("Spend currency")).toHaveCount(0);

  await expect(row.getByTestId("spend-preview")).toHaveText("₹ 12,40,000 ≈ USD 12,362 (rate on 3 Sep 2026) × 0.42 kgCO₂e/USD (2022 USD, deflated)");
  await expect(row.getByText("= 5.19 tCO₂e")).toBeVisible();
  expect(rateQueries.at(-1)?.toString()).toBe("currency=INR&date=2026-09-03&to=USD&price_year=2022");

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0]).toMatchObject({
    site_id: 4,
    category_id: 21,
    activity_data: { "@method": "spend_based", material: "chemicals", spent_value: "1240000", currency: "INR", invoice_date: "2026-09-03", emission_category: "Chemicals (USEEIO)" },
    activity_data_unit: "INR",
  });
});

test("the spend form works at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page, [], []);
  await page.goto("/data/new?site=4&category=21&period=2026-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Material").selectOption({ label: "Chemicals" });
  await row.getByLabel("Amount spent").fill("5000");
  await row.getByLabel("Currency").selectOption("USD");
  await expect(row.getByText(/× 0.42 kgCO₂e\/USD/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a spend row whose exchange rate can't load says the total is calculated on send, and still sends", async ({ page }) => {
  const created: Record<string, unknown>[] = [];
  await signIn(page, created, [], 503);
  await page.goto("/data/new?site=4&category=21&period=2026-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Material").selectOption({ label: "Chemicals" });
  // Nothing entered yet: the row asks for the amount (the unit field is hidden on the spend form).
  await page.getByRole("button", { name: "Review" }).click();
  await expect(row.getByLabel("Amount spent")).toHaveAccessibleDescription("Enter the amount spent");
  await row.getByLabel("Amount spent").fill("1240000");
  // The missing currency shows under Currency, not under the amount.
  await expect(row.getByLabel("Currency")).toHaveAccessibleDescription("Choose the currency");
  await expect(row.getByLabel("Amount spent")).not.toHaveAccessibleDescription("Choose the currency");
  await row.getByLabel("Currency").selectOption("INR");
  const note = row.getByText("Couldn't load the exchange rate. The total is calculated when you send.");
  await expect(note).toBeVisible();
  // A muted note, not an error, even after Review showed the row's issues.
  await expect(note).toHaveClass(/text-muted/);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0]).toMatchObject({ activity_data: { spent_value: "1240000", currency: "INR" }, activity_data_unit: "INR" });
});
