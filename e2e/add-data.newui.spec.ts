import { type Page, expect, test } from "@playwright/test";

/**
 * P03-A Add data smoke test (VITE_NEW_UI=1 server). Every API call is
 * answered locally; created rows are collected to check what a submit sends.
 */

const site = {
  site_id: 4,
  name: "Bahrain plant",
  company: { company_id: 1, name: "Midal Cables" },
  categories: [
    { category_id: 9, category_name: "Stationary combustion", scope: "Scope 1" },
    { category_id: 99, category_name: "FERA", scope: "Scope 3" },
  ],
};

const config = {
  pk_id: 1,
  config_name: "Fuel",
  columns: [
    { pk_id: 1, column_name: "fuel_type", column_type: "select" },
    { pk_id: 2, column_name: "quantity", column_type: "number" },
  ],
  column_options: { "1": [{ id: "diesel", label: "Diesel" }, { id: "lpg", label: "LPG" }] },
  emission_category_mapping: { Diesel: "Diesel (avg biofuel blend)", LPG: "LPG" },
  extra_fields: [{ key: "po_number", label: "PO number", type: "text", required: false }],
};

const factors = [
  { emission_factor_id: 1, emission_category_name: "Diesel (avg biofuel blend)", factor_value: 2.68, denominator_unit: "litre", year: 2024 },
  { emission_factor_id: 2, emission_category_name: "LPG", factor_value: 1.56, denominator_unit: "litre", year: 2024 },
];

// What the AI service returns for one bill: one diesel line it is unsure about.
const extraction = {
  filename: "bapco-sep.pdf",
  invoice_id: 41,
  cloudinary_url: "https://files.example/bapco-sep.pdf",
  error: null,
  data: [{ vendor_name: "Bapco", invoice_number: "INV-7", invoice_date: "2025-09-12", billing_month_end: "2025-09-30", total_amount: 812.5, currency: "BHD", line_items: [], activities: [] }],
  validations: [[{ check: "subtotal_plus_tax_equals_total", ok: false, delta: 12 }]],
  suggested_categories: [null],
  emission: [
    {
      invoice_index: 0,
      activity_index: 0,
      site_id: 4,
      category_id: 9,
      activity_data: { fuel_type: "Diesel", quantity: "1600", description: "Diesel delivery" },
      activity_data_unit: "Litre",
      date_of_reporting: "2025-09-30",
      total_emission: 0,
      unit: "kg CO2e",
    },
  ],
};

async function signIn(page: Page, created: unknown[], duplicateOnce = false, linked: unknown[] = []) {
  const user = { user_id: 7, name: "Uma User", email: "uma@midal.com", sites: [site] };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  let duplicate = duplicateOnce;
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "User", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json(null);
      if (path.includes("/user/column-configs/site/4/category/9")) return json([config]);
      if (path.endsWith("/user/emission-factors/site/4/category/99")) return json([]);
      if (path.endsWith("/user/emission-factors/site/4/category/9")) {
        const year = Number(url.searchParams.get("year"));
        return json(factors.map((f) => ({ ...f, year })));
      }
      if (path.includes("/user/units/site/4/category/")) return json([{ unit_id: 1, unit_name: "litre" }, { unit_id: 2, unit_name: "gallon" }]);
      if (path.includes("/user/category-mappings/")) return json([]);
      if (path.includes("/user/thresholds/company/1")) return json({ threshold_percentage: 5 });
      if (path.endsWith("/user/emissions/period-total")) {
        return json({ total_emission: url.searchParams.get("basis") === "approved" ? 4 : 0 });
      }
      if (path.endsWith("/user/emissions") && request.method() === "POST") {
        if (duplicate && url.searchParams.get("replace") !== "true") {
          duplicate = false;
          return json({ message: "Duplicate", duplicate: true, existing_emission: { pk_id: 1 } }, 409);
        }
        created.push({ body: request.postDataJSON(), replace: url.searchParams.get("replace") === "true" });
        return json({ emission: { pk_id: created.length + 100 } }, 201);
      }
      if (path.endsWith("/v1/invoices/upload")) return json(extraction);
      if (path.endsWith("/user/documents/from-invoice")) {
        linked.push(request.postDataJSON());
        return json({ message: "Invoice linked", documents: [] }, 201);
      }
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      return json({});
    },
  );
}

test("contributor types a row, sees tCO2e live and submits it", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  await signIn(page, created);
  await page.goto("/data/new");

  // Step 1: the single site is preselected; FERA is not offered.
  const category = page.getByLabel("Category");
  await expect(category.locator("option", { hasText: "FERA" })).toHaveCount(0);
  await category.selectOption({ label: "Stationary combustion · Scope 1" });
  await expect(page).toHaveURL(/category=9/);
  await page.goto("/data/new?site=4&category=9&period=2025-09");

  // A full deep link starts at step 2.
  await expect(page.getByText("Bahrain plant · Stationary combustion · Sep 2025")).toBeVisible();
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await expect(row.getByText("Global: Diesel (avg biofuel blend)")).toBeVisible();
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await expect(row.getByText("= 4.29 tCO₂e")).toBeVisible();
  await expect(row.getByText("factor year 2024 used for 2025 data")).toBeVisible();
  await expect(row.getByText("▲ 7.3% vs Aug 2025 (threshold 5%)")).toBeVisible();

  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("table")).toContainText("Diesel");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();

  expect(created).toHaveLength(1);
  expect(created[0].body).toMatchObject({
    site_id: 4,
    category_id: 9,
    activity_data: { fuel_type: "diesel", quantity: "1600", emission_category: "Diesel (avg biofuel blend)" },
    activity_data_unit: "litre",
    date_of_reporting: "2025-09-30",
    reporting_period: "monthly",
  });
});

test("an incomplete row blocks review and a duplicate can be replaced", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  await signIn(page, created, true);
  await page.goto("/data/new?site=4&category=9&period=FY2025");

  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("1 row needs attention")).toBeVisible();

  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "LPG" });
  await row.getByLabel("Quantity").fill("1000");
  await row.getByLabel("Unit").selectOption("litre");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Already entered for this period")).toBeVisible();
  await page.getByRole("button", { name: "Replace" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0]).toMatchObject({
    replace: true,
    body: { date_of_reporting: "2026-03-31", reporting_period: "yearly", year_type: "FY" },
  });
});

test("a bill is read into a row that is checked before it is sent, then attached as evidence", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  const linked: unknown[] = [];
  await signIn(page, created, false, linked);
  await page.goto("/data/new?site=4&category=9&period=2025-09");

  await page.getByRole("tab", { name: /Start from a bill/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "bapco-sep.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });

  const bill = page.getByRole("region", { name: "Bill Bapco" });
  await expect(bill.getByText("No. INV-7 · 30 Sep 2025 · 812.50 BHD")).toBeVisible();
  await expect(bill.getByText("The total doesn't match subtotal plus tax (off by 12).")).toBeVisible();
  const row = bill.getByRole("region", { name: "Row 1" });
  // The AI's labels became the form's values; each filled field is marked.
  await expect(row.getByLabel(/Fuel Type/)).toHaveValue("diesel");
  await expect(row.getByText("AI filled, check it")).toHaveCount(4);
  await expect(row.getByText("= 4.29 tCO₂e")).toBeVisible();

  // Nothing from the bill goes to review before the user checks it.
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("1 bill is not checked yet")).toBeVisible();
  await row.getByLabel(/Quantity/).fill("1500");
  await expect(row.getByText("AI filled, check it")).toHaveCount(3);
  await bill.getByRole("button", { name: "Use this row" }).click();
  await expect(bill.getByText("Checked")).toBeVisible();

  await page.getByRole("button", { name: "Review", exact: true }).click();
  // The empty typed row isn't sent alongside the bill row.
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("table")).toContainText("Bill, attached on send");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();

  expect(created).toHaveLength(1);
  expect(created[0].body).toMatchObject({
    activity_data: { fuel_type: "diesel", quantity: "1500", emission_category: "Diesel (avg biofuel blend)", description: "Diesel delivery" },
    activity_data_unit: "litre",
    date_of_reporting: "2025-09-30",
  });
  expect(JSON.stringify(created[0].body)).not.toContain("_bill");
  expect(linked).toEqual([{ invoice_id: 41, emission_ids: [101] }]);
});
