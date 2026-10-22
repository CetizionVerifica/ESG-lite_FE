import { type Page, expect, test } from "@playwright/test";

/**
 * P03-A Add data smoke test. Every API call is
 * answered locally; created rows are collected to check what a submit sends.
 */

const site = {
  site_id: 4,
  name: "Bahrain plant",
  company: { company_id: 1, name: "Midal Cables" },
  categories: [
    { category_id: 9, category_name: "Stationary combustion", scope: "Scope 1" },
    { category_id: 11, category_name: "Business travel", scope: "Scope 3" },
    { category_id: 12, category_name: "Purchased electricity", scope: "Scope 2" },
    { category_id: 99, category_name: "FERA", scope: "Scope 3" },
    { category_id: 13, category_name: "Upstream transportation and distribution", scope: "Scope 3" },
  ],
};

// A travel category: its unit is a distance, so the row gets Calculate distance.
const travelConfig = {
  pk_id: 2,
  config_name: "Travel",
  columns: [{ pk_id: 1, column_name: "Activity Data", column_type: "number" }],
};
// Scope 2 electricity and its Category 3 factors (S3-7): upstream (wtt) and T&D losses (td_loss, per kWh consumed).
const powerConfig = { pk_id: 3, config_name: "Power", columns: [{ pk_id: 1, column_name: "Consumption", column_type: "number" }] };
const powerFactors = [{ emission_factor_id: 4, emission_category_name: "Grid AU", factor_value: 0.8, denominator_unit: "kwh", year: 2024, factor_type: "combustion" }];
const feraFactors = [
  { emission_factor_id: 5, emission_category_name: "Grid AU", factor_value: 0.12, denominator_unit: "kwh", year: 2024, factor_type: "wtt" },
  { emission_factor_id: 6, emission_category_name: "Grid AU T&D losses", global_category_name: "Grid AU", factor_value: 0.08, denominator_unit: "kwh", year: 2024, factor_type: "td_loss" },
];
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

type Extra = {
  existing?: unknown[];
  updated?: unknown[];
  uploads?: string[];
  /** S3-15: the company's review workflow switch is on; edits come back as drafts. */
  workflow?: boolean;
  submitted?: number[][];
  checked?: unknown[][];
  /** SE-1: the company's entry_detail; "full" shows a User the calculation detail. */
  entryDetail?: "full";
  /** #183: what GET …/units/…/by-activity answers; without it the mock below answers a plain unit list (an older API). */
  unitOptions?: unknown;
};

async function signIn(page: Page, created: unknown[], duplicateOnce = false, linked: unknown[] = [], uploadGate?: Promise<void>, extra: Extra = {}) {
  // S3-15: the review workflow switch; SE-1: company.entry_detail "full" shows a User the calculation detail (missing = total only).
  const company = { ...site.company, ...(extra.workflow ? { review_workflow_v2: true } : {}), ...(extra.entryDetail ? { entry_detail: extra.entryDetail } : {}) };
  const user = { user_id: 7, name: "Uma User", email: "uma@midal.com", sites: [{ ...site, company }] };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "User");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  let duplicate = duplicateOnce;
  // No Maps key in tests: the drawer falls back to typed places and the map says it can't load.
  await page.route(/maps\.googleapis\.com/, (route) => route.abort());
  await page.route(
    (url) => url.port !== "4173" && !url.hostname.endsWith("googleapis.com"),
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
      if (path.endsWith("/user/emission-factors/site/4/category/99")) return json(feraFactors);
      if (path.includes("/user/column-configs/site/4/category/12")) return json([powerConfig]);
      if (path.endsWith("/user/emission-factors/site/4/category/12")) return json(powerFactors);
      if (path.endsWith("/user/emission-factors/site/4/category/9")) {
        // The page asks for every year; the factors here are 2024's.
        const year = Number(url.searchParams.get("year") ?? 2024);
        return json(factors.map((f) => ({ ...f, year })));
      }
      if (path.endsWith("/by-activity") && extra.unitOptions) return json(extra.unitOptions);
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
        return json({ emission: { pk_id: Number(path.split("/").pop()), ...(extra.workflow && { status: "draft" }) } });
      }
      if (path.endsWith("/user/emissions/check")) {
        // Live checks (S3-15): unsaved rows as they'd be saved. A saved entry with the same quantity is a
        // duplicate (an edit isn't compared with itself); evidence comes from the row; the factor check is
        // always held so the test sees a User doesn't get it.
        type CheckRow = { ref: string; id?: number; activity_data: Record<string, unknown>; has_evidence?: boolean };
        const rows = (request.postDataJSON() as { rows: CheckRow[] }).rows;
        extra.checked?.push(rows);
        const saved = (extra.existing ?? []) as { pk_id: number; activity_data: Record<string, unknown> }[];
        const results = rows.map((r) => {
          const held = ["FACTOR_FOUND"];
          // has_evidence left out on an edit: the saved row's evidence counts (the rejected sample has none).
          if (!r.has_evidence) held.push("EVIDENCE_ATTACHED");
          if (saved.some((x) => x.pk_id !== r.id && x.activity_data.quantity === r.activity_data.quantity)) held.push("NO_DUPLICATE");
          return { ref: r.ref, checks: { ready: false, held } };
        });
        return json({ results });
      }
      if (path.endsWith("/user/emissions/submit")) {
        const ids = (request.postDataJSON() as { ids: number[] }).ids;
        extra.submitted?.push(ids);
        return json({ submitted: ids, refused: [] });
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
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await expect(row.getByText("= 4.29 tCO₂e")).toBeVisible();
  await expect(row.getByText("▲ 7.3% vs Aug 2025 (threshold 5%)")).toBeVisible();
  // SE-1: a User sees the total, not how it was worked out.
  for (const text of ["Global:", "Factor ", "kgCO₂e per", "factor year", "(factor unit)", "FERA", "Calculation method"]) {
    await expect(row.getByText(text, { exact: false })).toHaveCount(0);
  }

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

// The S3-8 standard transport form (ESG-lite src/scope3/transport/configs.ts), trimmed to the chains used here.
const transportConfig = {
  pk_id: 13,
  config_name: "Transport - Standard - Upstream",
  columns: [
    { pk_id: 31, column_name: "Travel Mode", column_type: "select" },
    { pk_id: 32, column_name: "Vehicle Type", column_type: "select" },
    { pk_id: 33, column_name: "Fuel Type/Class", column_type: "select" },
    { pk_id: 34, column_name: "Shipment Ref", column_type: "text" },
    { pk_id: 35, column_name: "Weight (tonne)", column_type: "number" },
    { pk_id: 36, column_name: "Distance travelled", column_type: "number" },
    { pk_id: 37, column_name: "Fuel used (litres)", column_type: "number" },
    { pk_id: 38, column_name: "Your share of the load (%)", column_type: "number" },
  ],
  column_options: {
    "31": [{ id: "Road", label: "Road" }],
    "32": [{ id: "HGV (all diesel)", label: "HGV (all diesel)" }],
    "33": [{ id: "All rigids [tonne.km]", label: "All rigids [tonne.km]" }, { id: "Diesel used [litre]", label: "Diesel used [litre]" }],
  },
  column_dependencies: { "Vehicle Type": "Travel Mode", "Fuel Type/Class": "Vehicle Type" },
  dependent_options: {
    "Vehicle Type": { Road: [{ id: "HGV (all diesel)", label: "HGV (all diesel)" }] },
    "Fuel Type/Class": {
      "HGV (all diesel)": [
        { id: "All rigids [tonne.km]", label: "All rigids [tonne.km]" },
        { id: "Diesel used [litre]", label: "Diesel used [litre]" },
      ],
    },
  },
  emission_category_mapping: {
    "Road|HGV (all diesel)|All rigids [tonne.km]": "Road - HGV (all diesel) - All rigids [tonne.km]",
    "Road|HGV (all diesel)|Diesel used [litre]": "Fuel - Diesel (average biofuel blend) [litre]",
  },
  extra_fields: [{ key: "paid_by", label: "Who paid for this transport?", type: "select", required: false, options: ["We paid", "Customer or other"] }],
  calculation: {
    mode: "per_unit",
    identity_columns: ["Shipment Ref"],
    legacy_field: "Distance travelled",
    methods: {
      "tonne.km": { multiply: ["Weight (tonne)", "Distance travelled"], activity_unit: "tonne.km" },
      km: { multiply: ["Distance travelled"], activity_unit: "km" },
      litre: { multiply: ["Fuel used (litres)", "Your share of the load (%)"], percent: ["Your share of the load (%)"], activity_unit: "litre" },
    },
  },
};

const routeTransport = async (page: Page, form: Record<string, unknown> = transportConfig) => {
  await page.route(/\/user\/column-configs\/site\/4\/category\/13(\?|$)/, (route) => route.fulfill({ json: [form] }));
  await page.route(/\/user\/emission-factors\/site\/4\/category\/13(\?|$)/, (route) => {
    const year = Number(new URL(route.request().url()).searchParams.get("year") ?? 2024);
    return route.fulfill({
      json: [
        { emission_factor_id: 41, emission_category_name: "Fuel - Diesel (average biofuel blend) [litre]", factor_value: 3.1238, denominator_unit: "litre", year },
        { emission_factor_id: 42, emission_category_name: "Road - HGV (all diesel) - All rigids [tonne.km]", factor_value: 0.2408, denominator_unit: "tonne.km", year },
      ],
    });
  });
  await page.route(/\/user\/units\/site\/4\/category\/13(\?|$)/, (route) =>
    route.fulfill({ json: ["km", "tonne.km", "litre"].map((unit_name, i) => ({ unit_id: 50 + i, unit_name })) }),
  );
};

test("#183: the Unit select offers only the units the row's emission category takes", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  const unitOptions = {
    fixed_unit: null,
    all_units: ["litre", "gallon", "kWh", "kg"],
    activities: [
      { name: "Diesel (avg biofuel blend)", factor_unit: "litre", units: ["litre", "gallon"] },
      { name: "LPG", factor_unit: "litre", units: ["litre"] },
    ],
  };
  await signIn(page, created, false, [], undefined, { unitOptions });
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  const unit = row.getByLabel("Unit");

  // Nothing to choose until the row says what it is.
  await expect(unit).toBeDisabled();
  await expect(unit).toContainText("Make your choices above first");

  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await expect(unit).toBeEnabled();
  await expect(unit.locator("option")).toHaveText(["Choose a unit", "litre", "gallon"]);
  await unit.selectOption("gallon");

  // LPG takes litre only: gallon goes and litre is picked.
  await row.getByLabel("Fuel Type").selectOption({ label: "LPG" });
  await expect(unit).toHaveValue("litre");
  await expect(unit.locator("option")).toHaveText(["Choose a unit", "litre"]);

  await row.getByLabel("Quantity").fill("100");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0].body).toMatchObject({ activity_data_unit: "litre", activity_data: { emission_category: "LPG" } });
});

test("Category 4 from fuel used: 1,000 L of diesel at 100 % previews and sends what the engine saves (S3-8)", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  await signIn(page, created);
  await routeTransport(page);
  await page.goto("/data/new?site=4&category=13&period=2025-09");

  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Travel Mode", { exact: true }).selectOption({ label: "Road" });
  await row.getByLabel("Vehicle Type", { exact: true }).selectOption({ label: "HGV (all diesel)" });
  await row.getByLabel("Fuel Type/Class", { exact: true }).selectOption({ label: "Diesel used [litre]" });
  await row.getByLabel("Shipment Ref", { exact: true }).fill("GL-FUEL-0925");
  await row.getByLabel("Fuel Used (Litres)", { exact: true }).fill("1000");
  await row.getByLabel("Your Share Of The Load (%)", { exact: true }).fill("100");
  await row.getByLabel("Unit").selectOption("litre");
  // 1,000 L × 100 % × 3.1238 kg/L (life-cycle diesel, factor year 2024) = 3.12 t
  await expect(row.getByText("= 3.12 tCO₂e")).toBeVisible();
  await expect(row.getByText(/^Litres your carrier used for your goods/)).toBeVisible();

  await row.getByText("More details").click();
  await row.getByLabel("Who paid for this transport?").selectOption({ label: "We paid" });
  await expect(row.getByText(/^If you paid for it, it belongs in Category 4/)).toBeVisible();

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created).toHaveLength(1);
  expect(created[0].body).toMatchObject({
    site_id: 4,
    category_id: 13,
    activity_data_unit: "litre",
    activity_data: { "Fuel used (litres)": "1000", "Your share of the load (%)": "100", emission_category: "Fuel - Diesel (average biofuel blend) [litre]" },
    extra_data: { paid_by: "We paid" },
  });
  expect(created[0].body).not.toHaveProperty("is_estimate");
});

test("SE-1: on a form offering several methods, a User picks from every method's units and the unit says the method", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  await signIn(page, created);
  // As the S3-8 seed writes it (ESG-lite configs.ts methodOptionsFor(4)): fuel first.
  await routeTransport(page, {
    ...transportConfig,
    method_options: [
      { method: "fuel_based", units: ["litre"] },
      { method: "distance_based", units: ["tonne.km", "km"] },
      { method: "spend_based", units: ["INR", "USD"] },
    ],
  });
  await page.goto("/data/new?site=4&category=13&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  // Every method's units, not only the first method's; spend has its own fields.
  await expect(row.getByLabel("Unit").locator("option")).toHaveText(["Choose a unit", "litre", "tonne.km", "km"]);
  await expect(row.getByText("How is row 1 calculated?")).toHaveCount(0);
  await row.getByLabel("Travel Mode", { exact: true }).selectOption({ label: "Road" });
  await row.getByLabel("Vehicle Type", { exact: true }).selectOption({ label: "HGV (all diesel)" });
  await row.getByLabel("Fuel Type/Class", { exact: true }).selectOption({ label: "All rigids [tonne.km]" });
  await row.getByLabel("Shipment Ref", { exact: true }).fill("GL-ROAD-0925");
  await row.getByLabel("Weight (Tonne)", { exact: true }).fill("10");
  await row.getByLabel("Distance Travelled", { exact: true }).fill("500");
  await row.getByLabel("Unit").selectOption("tonne.km");
  // 10 t × 500 km × 0.2408 kg/tonne.km = 1.20 t
  await expect(row.getByText("= 1.20 tCO₂e")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0].body).toMatchObject({ activity_data_unit: "tonne.km", activity_data: { "@method": "distance_based" } });
});

test("SE-1: with company detail set to full, a User sees how the row is worked out", async ({ page }) => {
  await signIn(page, [], false, [], undefined, { entryDetail: "full" });
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await expect(row.getByText("Global: Diesel (avg biofuel blend)")).toBeVisible();
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await expect(row.getByText("= 4.29 tCO₂e")).toBeVisible();
  await expect(row.getByText("factor year 2024 used for 2025 data")).toBeVisible();
  await expect(row.getByText(/Factor 2\.68 kgCO₂e per litre/)).toBeVisible();
  await expect(row.getByLabel("Unit").locator("option", { hasText: "(factor unit)" })).toHaveCount(1);
});

test("SE-1: a User's problems are in plain words, with no factor talk", async ({ page }) => {
  await signIn(page, []);
  // No factor at all for this site × category.
  await page.route(/\/user\/emission-factors\/site\/4\/category\/9(\?|$)/, (route) => route.fulfill({ json: [] }));
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("10");
  await row.getByLabel("Unit").selectOption("litre");
  await expect(row.getByText("We can't work this row out yet. Ask your administrator.")).toBeVisible();
  await expect(row.getByText("No factor for this category")).toHaveCount(0);
  await expect(row.getByText(/emission factor/i)).toHaveCount(0);
});

// S3-9-style form whose spec lets the row pick its method (`@method`).
const methodConfig = (methods: string[]) => ({
  ...travelConfig,
  calculation: {
    mode: "per_method",
    method_column: "@method",
    methods: Object.fromEntries(methods.map((m) => [m, { multiply: ["Activity Data"], activity_unit: "passenger.km" }])),
  },
});

test("SE-1: a form with one method picks it for the User, out of sight, and still sends it", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  await signIn(page, created);
  await page.route(/\/user\/column-configs\/site\/4\/category\/11(\?|$)/, (route) => route.fulfill({ json: [methodConfig(["distance_based"])] }));
  await page.goto("/data/new?site=4&category=11&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption({ label: "Car (petrol)" });
  await expect(row.getByLabel("Calculation method")).toHaveCount(0);
  await expect(row.getByLabel("Type of record")).toHaveCount(0);
  await row.getByLabel("Unit").selectOption("passenger.km");
  await row.getByRole("textbox", { name: "Activity Data" }).fill("100");
  await expect(row.getByText("= 0.02 tCO₂e")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0].body).toMatchObject({ activity_data: { "@method": "distance_based", "Activity Data": "100" } });
});

test("SE-1: with several methods a User answers \"Type of record\", never \"Calculation method\"", async ({ page }) => {
  await signIn(page, []);
  await page.route(/\/user\/column-configs\/site\/4\/category\/11(\?|$)/, (route) => route.fulfill({ json: [methodConfig(["distance_based", "spend_based"])] }));
  await page.goto("/data/new?site=4&category=11&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await expect(row.getByLabel("Type of record")).toBeVisible();
  await expect(row.getByLabel("Calculation method")).toHaveCount(0);
  await expect(row.getByText("Choose how this row is calculated")).toHaveCount(0);
});

// The engine's notes on a saved row (S3-4) go to reviewers; a User sees "Sent" (SE-1).
const savedWithNote = async (page: Page, note: string) => {
  await page.route(/\/user\/emissions(\?|$)/, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 201, json: { emission: { pk_id: 301 }, warnings: [{ code: "FERA_FACTOR_MISSING", message: note }] } })
      : route.fallback(),
  );
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
};
const NOTE = 'No 2024 FERA factor for "Diesel (avg biofuel blend)", so no fuel- and energy-related (Category 3) row was added.';

test("the engine's notes on a saved row show on the result when the company shows full detail (S3-4)", async ({ page }) => {
  await signIn(page, [], false, [], undefined, { entryDetail: "full" });
  await savedWithNote(page, NOTE);
  // The warn callout is role="status", so the note is announced.
  await expect(page.getByRole("status").filter({ hasText: "Sent, with notes" })).toContainText(NOTE);
});

test("SE-1: a User sees \"Sent\"; the engine's notes are for reviewers", async ({ page }) => {
  await signIn(page, []);
  await savedWithNote(page, NOTE);
  await expect(page.getByText("Sent, with notes")).toHaveCount(0);
  await expect(page.getByText(NOTE)).toHaveCount(0);
});

test("with no factor in the factor year, the preview uses the newest factor from another year, as the save does", async ({ page }) => {
  await signIn(page, [], false, [], undefined, { entryDetail: "full" }); // the factor line shows with full detail (SE-1)
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
  await expect(row.getByText("no 2024 factor; 2023 used for 2025 data")).toBeVisible();
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

test("Fix and resubmit (S3-15): a Fix link opens the rejected row with live checks, then Save and submit sends it", async ({ page }) => {
  const created: unknown[] = [];
  const updated: { id: number; body: Record<string, unknown> }[] = [];
  const submitted: number[][] = [];
  const checked: { ref: string; id?: number; activity_data: Record<string, unknown> }[][] = [];
  await signIn(page, created, false, [], undefined, { existing: [rejected], updated, workflow: true, submitted, checked });
  await page.goto("/data/new?site=4&category=9&period=2025-09&fix=55");

  // The row is loaded straight away, with the manager's reason above it.
  await expect(page.getByText("Sent back to you")).toBeVisible();
  await expect(page.getByText("Quantity is missing a zero").first()).toBeVisible();
  const row = page.getByRole("region", { name: "Row 1" });
  await expect(row.getByLabel("Quantity")).toHaveValue("160");
  await expect(page).not.toHaveURL(/fix=/);

  // Live checks: a User sees the checks they can act on, not the factor one; an edit isn't its own duplicate.
  const checks = page.getByRole("region", { name: "Checks before you send" });
  await expect(checks.getByText("No evidence")).toBeVisible();
  await expect(checks.getByText("No duplicate")).toBeVisible();
  await expect(checks.getByText(/factor/i)).toHaveCount(0);
  await row.getByLabel("Quantity").fill("1600");
  // The unsaved row is checked as the save would send it, as an edit of entry 55.
  await expect.poll(() => checked.at(-1)?.[0]?.activity_data.quantity).toBe("1600");
  expect(checked.at(-1)?.[0]).toMatchObject({ id: 55, activity_data: { fuel_type: "diesel", quantity: "1600" } });

  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("button", { name: "Save as draft" })).toBeVisible();
  await page.getByRole("button", { name: "Save and submit" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(updated).toHaveLength(1);
  expect(submitted).toEqual([[55]]);
});

test("live checks (S3-15): typing a duplicate value holds Duplicate before saving; attaching evidence clears Evidence", async ({ page }) => {
  const created: unknown[] = [];
  const checked: { ref: string; has_evidence?: boolean }[][] = [];
  await signIn(page, created, false, [], undefined, { existing: [rejected], workflow: true, checked });
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Unit").selectOption("litre");
  await row.getByLabel("Quantity").fill("500");

  const checks = page.getByRole("region", { name: "Checks before you send" });
  await expect(checks.getByText("No duplicate")).toBeVisible();
  await expect(checks.getByText("No evidence")).toBeVisible();

  // The saved, rejected entry has 160 litres: the same value is held as a possible duplicate, before any save.
  await row.getByLabel("Quantity").fill("160");
  await expect(checks.getByText("Possible duplicate")).toBeVisible();
  expect(created).toHaveLength(0);

  await row.getByText("Evidence", { exact: true }).click();
  await row.locator('input[type="file"]').setInputFiles({ name: "meter-sep.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(checks.getByText("Evidence attached")).toBeVisible();
  await expect(checks.getByText("No evidence")).toHaveCount(0);
  expect(checked.at(-1)?.[0]).toMatchObject({ has_evidence: true });
  // A check never blocks sending.
  await expect(page.getByRole("button", { name: "Review" })).toBeEnabled();
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
  await expect(drawer.getByText("Estimate", { exact: true })).toBeVisible();
  await expect(drawer.getByText("The entry is saved as an estimate.")).toBeVisible();
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
  // A road route is not an estimate (S3-3 is_estimate).
  expect(created[0].body).not.toHaveProperty("is_estimate");
});

test("a rail estimate from the distance drawer is saved as an estimate (S3-3)", async ({ page }) => {
  const created: { body: Record<string, unknown>; replace: boolean }[] = [];
  await signIn(page, created);
  await page.goto("/data/new?site=4&category=11&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption({ label: "Car (petrol)" });
  await row.getByLabel("Unit").selectOption("passenger.km");
  await row.getByLabel("Passenger").fill("1");
  await row.getByRole("button", { name: "Calculate distance" }).click();
  const drawer = page.getByRole("dialog", { name: "Calculate distance" });
  await drawer.getByRole("textbox", { name: "From" }).fill("Manama");
  await drawer.getByRole("textbox", { name: "From" }).press("Enter");
  await drawer.getByRole("textbox", { name: "To" }).fill("Riffa");
  await drawer.getByRole("textbox", { name: "To" }).press("Enter");
  await drawer.getByRole("radio", { name: "Rail" }).click();
  await expect(drawer.getByText("The entry is saved as an estimate.")).toBeVisible();
  await drawer.getByRole("button", { name: "Use this distance" }).click();
  await expect(row.getByLabel("Distance (km)")).toHaveValue("21.5");

  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();
  expect(created[0].body).toMatchObject({ is_estimate: true, activity_data_unit: "passenger.km" });
  expect(created[0].body.activity_data).not.toHaveProperty("_estimates");
});

test("typed rows ask before leaving the page", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Quantity").fill("10");
  await page.getByRole("link", { name: "Current Month" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Leave with rows not sent?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(row.getByLabel("Quantity")).toHaveValue("10");
});

test("typed rows survive a page reload", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await expect(row.getByText("= 4.29 tCO₂e")).toBeVisible();
  // The unsaved-rows guard asks before the reload; leave anyway.
  const asked: string[] = [];
  page.once("dialog", (d) => {
    asked.push(d.type());
    void d.accept();
  });
  await page.reload();
  expect(asked).toEqual(["beforeunload"]);
  const restored = page.getByRole("region", { name: "Row 1" });
  await expect(restored.getByLabel("Quantity")).toHaveValue("1600");
  await expect(restored.getByText("= 4.29 tCO₂e")).toBeVisible();
});

test("after a send the steps are locked and a reload shows an empty form", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();

  // No way back into the rows just sent.
  const progress = page.getByRole("navigation", { name: "Progress" });
  await expect(progress.getByRole("button")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("add-data:7:4:9:2025-09"))).toBeNull();

  // Nothing is left to lose, so the reload doesn't ask, and the form is empty.
  let asked = false;
  page.once("dialog", (d) => {
    asked = true;
    void d.accept();
  });
  await page.reload();
  expect(asked).toBe(false);
  await expect(page.getByRole("region", { name: "Row 1" }).getByLabel("Quantity")).toHaveValue("");
});

test("when every row is skipped as a duplicate, the draft is cleared and leaving doesn't ask", async ({ page }) => {
  await signIn(page, [], true);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apply (skip all)" }).click();
  await expect(page.getByText("Nothing was sent")).toBeVisible();
  // Skipped keeps the saved entry: the send is finished, as the spec says ("cleared once every row is sent or skipped").
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("add-data:7:4:9:2025-09"))).toBeNull();
  await page.getByRole("link", { name: "Back to Current Month" }).click();
  await expect(page).toHaveURL(/\/my-month/);
  await expect(page.getByRole("dialog", { name: "Leave with rows not sent?" })).toHaveCount(0);
});

test("after a send, new rows for the same category and month are guarded again", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Fuel Type").selectOption({ label: "Diesel" });
  await row.getByLabel("Quantity").fill("1600");
  await row.getByLabel("Unit").selectOption("litre");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("1 row sent for approval")).toBeVisible();

  // Add another category, then pick the same one again and type a new row.
  await page.getByRole("button", { name: "Add another category" }).click();
  await page.getByLabel("Category").selectOption({ label: "Stationary combustion · Scope 1" });
  await page.getByRole("button", { name: "Continue" }).click();
  const fresh = page.getByRole("region", { name: "Row 1" });
  await expect(fresh.getByLabel("Quantity")).toHaveValue("");
  await fresh.getByLabel("Quantity").fill("10");
  await page.getByRole("link", { name: "Current Month" }).first().click();
  await expect(page.getByRole("dialog", { name: "Leave with rows not sent?" })).toBeVisible();
});

test("another person signing in on the same tab doesn't get the previous person's draft", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  await page.getByRole("region", { name: "Row 1" }).getByLabel("Quantity").fill("1600");
  // The first person's draft is saved.
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("add-data:7:4:9:2025-09"))).toContain("1600");
  // Someone else on the same site signs in on this tab.
  const other = { user_id: 8, name: "Ola Other", email: "ola@midal.com", sites: [site] };
  await page.addInitScript((u) => localStorage.setItem("user", u), JSON.stringify(other));
  await page.route(/\/auth\/me$/, (route) => route.fulfill({ json: { role: "User", user: other } }));
  const asked: string[] = [];
  page.once("dialog", (d) => {
    asked.push(d.type());
    void d.accept();
  });
  await page.reload();
  expect(asked).toEqual(["beforeunload"]);
  await expect(page.getByRole("region", { name: "Row 1" }).getByLabel("Quantity")).toHaveValue("");
});

test("signing out removes the typed-rows drafts from the tab", async ({ page }) => {
  await signIn(page, []);
  await page.goto("/data/new?site=4&category=9&period=2025-09");
  await page.getByRole("region", { name: "Row 1" }).getByLabel("Quantity").fill("1600");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("add-data:7:4:9:2025-09"))).toContain("1600");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("add-data:")))).toEqual([]);
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

test("a Scope 2 row previews its Category 3 rows: upstream of electricity and T&D losses", async ({ page }) => {
  await signIn(page, [], false, [], undefined, { entryDetail: "full" }); // Category 3 rows show with full detail (SE-1)
  await page.goto("/data/new?site=4&category=12&period=2025-09");
  const row = page.getByRole("region", { name: "Row 1" });
  await row.getByLabel("Emission category").selectOption({ label: "Grid AU" });
  await row.getByLabel("Consumption").fill("500000");
  await row.getByLabel("Unit").selectOption("kwh");
  await expect(row.getByText("= 400.00 tCO₂e")).toBeVisible();
  const cat3 = row.locator("p", { hasText: "added on save" });
  await expect(cat3).toHaveText(/^\+ Cat 3\s*60\.00 tCO₂e \(upstream of electricity\) \+ 40\.00 tCO₂e \(T&D losses\), added on save$/);
  // The Cat 3 explainer is a button, so keyboard users reach it too.
  await expect(cat3.getByRole("button", { name: "What is Cat 3?" })).toBeVisible();
});
