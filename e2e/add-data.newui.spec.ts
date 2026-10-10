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
    { category_id: 11, category_name: "Business travel", scope: "Scope 3" },
    { category_id: 99, category_name: "FERA", scope: "Scope 3" },
  ],
};

// A travel category: its unit is a distance, so the row gets Calculate distance.
const travelConfig = {
  pk_id: 2,
  config_name: "Travel",
  columns: [{ pk_id: 1, column_name: "Activity Data", column_type: "number" }],
};
const travelFactors = [{ emission_factor_id: 3, emission_category_name: "Car (petrol)", factor_value: 0.17, denominator_unit: "passenger.km", year: 2024 }];

// Already saved for Sep 2025: one rejected diesel row.
const rejected = {
  pk_id: 55,
  activity_data: { fuel_type: "diesel", quantity: "160", emission_category: "Diesel (avg biofuel blend)" },
  extra_data: {},
  total_emission: 0.43,
  date_of_reporting: "2025-09-30",
  reporting_period: "monthly",
  activity_data_unit: "litre",
  status: "rejected",
  review_comment: "Quantity is missing a zero",
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

type Extra = { existing?: unknown[]; updated?: unknown[]; uploads?: string[] };

async function signIn(page: Page, created: unknown[], duplicateOnce = false, linked: unknown[] = [], uploadGate?: Promise<void>, extra: Extra = {}) {
  const user = { user_id: 7, name: "Uma User", email: "uma@midal.com", sites: [site] };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  let duplicate = duplicateOnce;
  // No Maps key in tests: the drawer falls back to typed places and the map says it can't load.
  await page.route(/maps\.googleapis\.com/, (route) => route.abort());
  await page.route(
    (url) => url.port !== "4174" && !url.hostname.endsWith("googleapis.com"),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "User", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json(null);
      if (path.includes("/user/column-configs/site/4/category/9")) return json([config]);
      if (path.includes("/user/column-configs/site/4/category/11")) return json([travelConfig]);
      if (path.endsWith("/user/emission-factors/site/4/category/11")) return json(travelFactors);
      if (path.endsWith("/user/emission-factors/site/4/category/99")) return json([]);
      if (path.endsWith("/user/emission-factors/site/4/category/9")) {
        // The page asks for every year; the factors here are 2024's.
        const year = Number(url.searchParams.get("year") ?? 2024);
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
          return json({ message: "Duplicate", duplicate: true, existing_emission: { pk_id: 1, total_emission: 1.5, status: "pending" } }, 409);
        }
        created.push({ body: request.postDataJSON(), replace: url.searchParams.get("replace") === "true" });
        return json({ emission: { pk_id: created.length + 100 } }, 201);
      }
      if (path.endsWith("/user/emissions") && request.method() === "GET") {
        const data = extra.existing ?? [];
        return json({ data, total: data.length, summary: { total_emission: 0, pending_count: 0, approved_count: 0, rejected_count: data.length } });
      }
      if (/\/user\/emissions\/\d+$/.test(path) && request.method() === "PUT") {
        extra.updated?.push({ id: Number(path.split("/").pop()), body: request.postDataJSON() });
        return json({ emission: { pk_id: Number(path.split("/").pop()) } });
      }
      if (path.endsWith("/user/documents/multiple")) {
        extra.uploads?.push(request.postData() ?? "");
        return json({ message: "Uploaded", documents: [{ pk_id: 1 }] }, 201);
      }
      if (path.endsWith("/user/emissions/geocode-location")) {
        const query = String((request.postDataJSON() as { query?: string }).query);
        const place = query.startsWith("Manama") ? { display_name: "Manama, Bahrain", lat: 26.2285, lon: 50.586 } : { display_name: "Riffa, Bahrain", lat: 26.13, lon: 50.555 };
        return json({ success: true, data: place });
      }
      if (path.endsWith("/user/emissions/calculate-distance")) {
        return json({ success: true, data: { mode: "road", distanceMeters: 21500, durationText: "25 mins", encodedPolyline: null, duration: null, origin: "", destination: "" } });
      }
      if (path.endsWith("/v1/invoices/upload")) {
        if (uploadGate) await uploadGate;
        // An August bill dropped on the September page.
        const august = (request.postData() ?? "").includes("bapco-aug.pdf");
        return json(august ? { ...extraction, invoice_id: 42, data: [{ ...extraction.data[0], invoice_number: "INV-6", billing_month_end: "2025-08-31" }] } : extraction);
      }
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

test("with no factor in the factor year, the preview uses the newest earlier one, as the save does", async ({ page }) => {
  await signIn(page, []);
  // Only 2022 and 2023 factors exist; Sep 2025 data looks for 2024 first.
  const older = [
    { ...factors[0], emission_factor_id: 21, factor_value: 2.5, year: 2023 },
    { ...factors[0], emission_factor_id: 20, factor_value: 2.4, year: 2022 },
  ];
  await page.route(/\/user\/emission-factors\/site\/4\/category\/9(\?|$)/, (route) => {
    // Like the backend: ?year= filters to that year, no year returns them all.
    const year = new URL(route.request().url()).searchParams.get("year");
    return route.fulfill({ json: year ? older.filter((f) => f.year === Number(year)) : older });
  });
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("1000");
  await row.getByLabel("Unit").selectOption("litre");
  await expect(row.getByText("factor year 2023 used for 2025 data")).toBeVisible();
  await expect(row.getByText("= 2.50 tCO₂e")).toBeVisible();
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
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 row is already entered for");
  await expect(dialog).toContainText("Saved: 1.50 tCO₂e (Pending)");
  await dialog.getByRole("radio", { name: "Replace" }).click();
  await dialog.getByRole("button", { name: "Apply (replace 1)" }).click();
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

test("a bill dated outside the period can't be used on this page", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  await page.getByRole("tab", { name: /Start from a bill/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "bapco-aug.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });

  const bill = page.getByRole("region", { name: "Bill Bapco" });
  await expect(bill.getByText("This bill is dated 31 Aug 2025, outside Sep 2025.", { exact: false })).toBeVisible();
  await expect(bill.getByRole("button", { name: "Use this row" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("1 bill is not checked yet")).toBeVisible();
  await bill.getByRole("button", { name: "Remove bill" }).click();
  await expect(page.getByRole("region", { name: "Bill Bapco" })).toHaveCount(0);
});

test("review waits for a bill that is still being read, and its rows still need checking", async ({ page }) => {
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await signIn(page, [], false, [], gate);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  await page.getByRole("tab", { name: /Start from a bill/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "bapco-sep.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await expect(page.getByText("Uploading and reading bapco-sep.pdf", { exact: false })).toBeVisible();

  // Switching tabs keeps the read going.
  await page.getByRole("tab", { name: "Type it in" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("1 bill is still being read")).toBeVisible();

  release();
  await page.getByRole("tab", { name: /Start from a bill/ }).click();
  await expect(page.getByRole("region", { name: "Bill Bapco" })).toBeVisible();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("1 bill is not checked yet")).toBeVisible();
});

test("a rejected entry can be fixed from the entries already saved", async ({ page }) => {
  const created: unknown[] = [];
  const updated: { id: number; body: Record<string, unknown> }[] = [];
  await signIn(page, created, false, [], undefined, { existing: [rejected], updated });
  await page.goto("/data/new?site=4&category=9&period=2025-09");

  const saved = page.getByRole("region", { name: "Already entered for Sep 2025 (1)" });
  await expect(saved).toContainText("Reason: Quantity is missing a zero");
  await saved.getByRole("button", { name: "Fix Diesel (avg biofuel blend)" }).click();

  // The empty first row gives way to the loaded entry.
  const row = page.getByRole("region", { name: "Row 1" });
  await expect(row.getByLabel("Quantity")).toHaveValue("160");
  await expect(page.getByRole("region", { name: "Row 2" })).toHaveCount(0);
  await row.getByLabel("Quantity").fill("1600");
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Changes a saved entry")).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();

  expect(created).toHaveLength(0);
  expect(updated).toHaveLength(1);
  expect(updated[0]).toMatchObject({ id: 55, body: { activity_data: { fuel_type: "diesel", quantity: "1600" }, activity_data_unit: "litre" } });
});

test("a passenger.km row works the distance out in the drawer", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  await signIn(page, created);
  await page.goto("/data/new?site=4&category=11&period=2025-09");

  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption({ label: "Car (petrol)" });
  await row.getByLabel("Unit").selectOption("passenger.km");
  await row.getByLabel("Passenger").fill("2");
  await row.getByRole("button", { name: "Calculate distance" }).click();

  const drawer = page.getByRole("dialog", { name: "Calculate distance" });
  await expect(drawer.getByRole("button", { name: "Use this distance" })).toBeDisabled();
  await drawer.getByRole("textbox", { name: "From" }).fill("Manama");
  await drawer.getByRole("textbox", { name: "From" }).press("Enter");
  await drawer.getByRole("textbox", { name: "To" }).fill("Riffa");
  await drawer.getByRole("textbox", { name: "To" }).press("Enter");
  await expect(drawer.getByText("21.50 km")).toBeVisible();
  await expect(drawer.getByText("About 25 mins by road")).toBeVisible();

  // Rail is an estimate on the road corridor.
  await drawer.getByRole("radio", { name: "Rail" }).click();
  await expect(drawer.getByText("Estimate")).toBeVisible();
  await drawer.getByRole("radio", { name: "Road" }).click();
  await drawer.getByRole("button", { name: "Use this distance" }).click();

  await expect(drawer).toBeHidden();
  await expect(row.getByLabel("Distance (km)")).toHaveValue("21.5");
  await expect(row.getByText("= 43.00 passenger.km")).toBeVisible();

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0].body).toMatchObject({ activity_data: { "Activity Data": "43", emission_category: "Car (petrol)" }, activity_data_unit: "passenger.km" });
  expect(Object.keys(created[0].body.activity_data as object)).not.toContain("Activity Data__distance");
});

test("typed rows ask before leaving the page", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Quantity").fill("10");
  await page.getByRole("link", { name: "My month" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Leave with rows not sent?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(row.getByLabel("Quantity")).toHaveValue("10");
});

test("files picked on a typed row are attached to it after it is saved", async ({ page }) => {
  const created: unknown[] = [];
  const uploads: string[] = [];
  await signIn(page, created, false, [], undefined, { uploads });
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("100");
  await row.getByLabel("Unit").selectOption("litre");
  await row.getByText("Evidence", { exact: true }).click();
  await row.locator('input[type="file"]').setInputFiles({ name: "meter-sep.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(row.getByText("meter-sep.pdf")).toBeVisible();

  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("1 file, attached on send")).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toContain("meter-sep.pdf");
  expect(uploads[0]).toContain("101");
});
