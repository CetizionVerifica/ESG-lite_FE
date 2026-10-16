import { type Page, expect, test } from "@playwright/test";

/**
 * P27 Bulk upload smoke test. The backend and the AI
 * service (`/v1/excel/*`) answer from fixtures, and the AI service calls are
 * recorded so the test can check what the import sent.
 */

const SITES = [
  {
    site_id: 1,
    name: "Hidd",
    company: { company_id: 1, name: "Midal Cables" },
    categories: [
      { category_id: 1, category_name: "Fuel", scope: "Scope 1" },
      { category_id: 3, category_name: "Electricity", scope: "Scope 2" },
    ],
  },
  { site_id: 2, name: "Pune", company: { company_id: 2, name: "Gulf Foods" }, categories: [] },
];

const FUEL_FORM = {
  pk_id: 7,
  config_name: "Hidd fuel",
  columns: [
    { pk_id: 1, column_name: "Fuel Category", column_type: "text" },
    { pk_id: 2, column_name: "Quantity", column_type: "number" },
  ],
};

const HEADERS = ["Fuel Category", "Quantity", "Unit"];

/** What the AI service answers since IM11: ESG-lite's plan and its rows, flattened. */
const PLAN = {
  plan_id: "11111111-2222-4333-8444-555555555555",
  version: 1,
  status: "draft",
  counts: { rows: 3, ready: 2, issue: 1, skipped: 0, warnings: 0 },
  totals: { tco2e: 0.3835, by_category: [{ category_id: 1, name: "Fuel", scope: "Scope 1", tco2e: 0.3835, rows: 2 }], by_month: [{ month: "2026-08", tco2e: 0.3835 }] },
  issues_summary: [{ code: "NO_FACTOR_FOR_YEAR", count: 1, example_row_refs: ["Row 3"] }],
  expires_at: "2026-08-02T00:00:00.000Z",
};
const PREVIEW = [
  { row: 1, row_ref: "Row 1", state: "ready", issues: [], emission_category: "Diesel", activity_value: 100, activity_data_unit: "litres", global_category_name: "Diesel", factor_value: 0.00268, factor_year: 2024, denominator_unit: "litres", total_emission: 0.268, fera_total_emission: null, date_of_reporting: "2026-08-31" },
  { row: 2, row_ref: "Row 2", state: "ready", issues: [], emission_category: "Petrol", activity_value: 50, activity_data_unit: "litres", global_category_name: "Petrol", factor_value: 0.00231, factor_year: 2024, denominator_unit: "litres", total_emission: 0.1155, fera_total_emission: null, date_of_reporting: "2026-08-31" },
  {
    row: 3,
    row_ref: "Row 3",
    state: "issue",
    issues: [{ code: "NO_FACTOR_FOR_YEAR", severity: "error", message: '"Biogas" matches no emission factor or mapping. Did you mean: Diesel; Petrol?' }],
    emission_category: "Biogas",
    activity_value: 10,
    activity_data_unit: "m3",
    global_category_name: null,
    factor_value: null,
    factor_year: null,
    denominator_unit: null,
    total_emission: null,
    fera_total_emission: null,
    date_of_reporting: "2026-08-31",
    row_error: '"Biogas" matches no emission factor or mapping. Did you mean: Diesel; Petrol?',
  },
];

const HISTORICAL_ROWS = [
  { row: 1, period: "2019-01", fuelType: "Grid", activity: "1000", unit: "kWh", total: 0.5, totalFrom: "calculated", status: "import", reason: null },
  { row: 2, period: "2019-01", fuelType: "Grid", activity: "5", unit: "kWh", total: 0, totalFrom: "calculated", status: "skip", reason: "Same month as row 1; only one entry per month is kept." },
];
const HISTORICAL_SUMMARY = { totalRows: 2, toImport: 1, toSkip: 1, newPeople: 1, existingPeople: 0, site: { id: 1, name: "Hidd" }, category: { id: 1, name: "Fuel" } };

const SUPERADMIN = { user_id: 9, name: "Sam Staff", email: "sam@example.com" };
const CONTRIBUTOR = { user_id: 4, name: "Cara Contributor", email: "cara@example.com", sites: [SITES[0]] };

/** When set, `/v1/excel/import` answers with this instead of a committed batch. */
let importAnswer: { status: number; body: unknown } | null = null;

async function signIn(page: Page, role = "Superadmin", user: object = SUPERADMIN) {
  const ai: Array<{ path: string; body: unknown }> = [];
  const historical: string[] = [];
  await page.addInitScript(
    ([r, u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [role, JSON.stringify(user)],
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers: { "access-control-allow-origin": "*" } });
      if (request.method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
      }

      if (path.startsWith("/v1/excel/")) {
        const body = path.endsWith("/upload") ? null : request.postDataJSON();
        ai.push({ path, body });
        if (path.endsWith("/upload")) return json({ document_id: 42, headers: HEADERS });
        if (path.endsWith("/unique-categories")) return json({ unique_categories: ["Diesel", "Petrol", "Biogas"], total_rows: 3 });
        if (path.endsWith("/preview")) return json({ plan: PLAN, rows: PREVIEW, total_rows: 3, page: 1, page_size: 100, not_selected: 0, sheet_rows: 3 });
        if (path.endsWith("/import")) {
          if (importAnswer) return json(importAnswer.body, importAnswer.status);
          return json({ inserted: 2, fera_inserted: 0, skipped: 1, skipped_rows: [{ row: 3, emission_category: "Biogas", reason: PREVIEW[2].row_error }], not_selected: 0, total_rows: 3, upload_batch_id: "b-1", plan_id: PLAN.plan_id, plan: { ...PLAN, status: "committed", version: 2 } });
        }
      }

      if (path.endsWith("/admin/upload/emissions")) {
        const body = request.postData() ?? "";
        historical.push(body);
        if (!body.includes('name="commit"')) return json({ dryRun: true, summary: HISTORICAL_SUMMARY, rows: HISTORICAL_ROWS, people: [{ email: "new@example.com", name: "New", exists: false }], invalidEmails: [] });
        return json({
          dryRun: false,
          summary: { ...HISTORICAL_SUMMARY, emissionsCreated: 1, emissionsSkipped: 1, usersCreated: 1, createdUsers: ["new@example.com"], invitesSent: 0, inviteWarning: "Email isn't configured on this server, so the invite wasn't sent." },
          skippedRows: [{ row: 2, period: "2019-01", reason: "Same month as row 1; only one entry per month is kept." }],
        });
      }
      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/column-configs/site/1/category/1")) return json([FUEL_FORM]);
      if (path.endsWith("/user/column-configs/site/1/category/1")) return json([FUEL_FORM]);
      return json({});
    },
  );
  return { ai, historical };
}

test("a superadmin uploads a sheet, maps it, previews and imports the rows", async ({ page }) => {
  const { ai } = await signIn(page);
  await page.goto("/capture/upload?period=2026-08");
  await expect(page.getByRole("heading", { name: "Bulk upload" })).toBeVisible();

  // Upload: client, site and category, then the file.
  const next = page.getByRole("button", { name: "Upload and map columns" });
  await expect(next).toBeDisabled();
  await page.getByLabel("Client").selectOption({ label: "Midal Cables" });
  const site = page.getByRole("combobox", { name: "Site" });
  await site.click();
  await site.fill("Hid");
  await page.getByRole("option", { name: "Hidd" }).click();
  await page.getByLabel("Category").selectOption({ label: "Fuel" });
  await expect(page).toHaveURL(/client=1/);
  await expect(page).toHaveURL(/site=1/);
  await expect(page).toHaveURL(/category=1/);
  await page.locator('input[type="file"]').setInputFiles({ name: "fuel-aug.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") });
  await expect(next).toBeEnabled();
  await next.click();

  // Map: the category and quantity columns match by name; the unit needs a pick.
  await expect(page.locator("[aria-current=step]")).toContainText("Map columns");
  await expect(page.getByText("Still to map: Activity unit.")).toBeVisible();
  const toPreview = page.getByRole("button", { name: "Preview rows" });
  await expect(toPreview).toBeDisabled();
  await page.getByLabel("Sheet column for Activity unit").selectOption("Unit");
  await expect(page.getByText("3 rows, 3 categories.", { exact: false })).toBeVisible();
  // Only the category column goes to unique-categories.
  expect(ai.find((c) => c.path.endsWith("/unique-categories"))?.body).toEqual({ document_id: 42, mappings: { emission_category: "Fuel Category" } });
  await toPreview.click();

  // Preview: ESG-lite's plan, with one row it won't import, shown under Issues.
  const previewSent = ai.find((c) => c.path.endsWith("/preview"))?.body as Record<string, unknown>;
  expect(previewSent).toMatchObject({ document_id: 42, selected_categories: [], site_id: 1, category_id: 1, date_of_reporting: "2026-08-31", page: 1, page_size: 100 });
  expect(previewSent.plan_id).toBeUndefined();
  const table = page.getByRole("table", { name: "Preview of the rows to import" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("columnheader", { name: "Factor used" })).toBeVisible(); // reviewer detail stays (SE-1)
  await expect(page.getByText("3 rows. 2 ready, 1 need a look.")).toBeVisible();
  await expect(page.getByText("Will import", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Issues (1)" }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText('Won\'t import: "Biogas" matches no emission factor');

  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText("Imported 2 rows.")).toBeVisible();
  await expect(page.getByText("Rows arrive as Pending")).toBeVisible();
  await expect(page.getByText("1 row was skipped. The file gives the reason for each one.")).toBeVisible();

  // The import commits the previewed plan at its version; nothing else is re-sent as a calculation.
  const sent = ai.find((c) => c.path.endsWith("/import"))?.body as Record<string, unknown>;
  expect(sent).toMatchObject({
    document_id: 42,
    selected_categories: [],
    site_id: 1,
    category_id: 1,
    date_of_reporting: "2026-08-31",
    plan_id: PLAN.plan_id,
    version: 1,
  });
  expect(sent.user_id).toBeUndefined();
  expect(sent.mappings).toEqual({
    emission_category: "Fuel Category",
    "Fuel Category": "Fuel Category",
    activity_value: "Quantity",
    Quantity: "Quantity",
    activity_data_unit: "Unit",
  });

  await page.getByRole("button", { name: "Start another upload" }).click();
  await expect(page.locator("[aria-current=step]")).toContainText("Upload");
});

test("a plan that moved since the preview offers Back to preview, not Try again", async ({ page }) => {
  importAnswer = { status: 409, body: { detail: { code: "IMPORT_PLAN_VERSION_CONFLICT", message: "Version moved.", details: { current_version: 2 } } } };
  try {
    const { ai } = await signIn(page);
    await page.goto("/capture/upload?period=2026-08&client=1&site=1&category=1");
    await page.locator('input[type="file"]').setInputFiles({ name: "fuel-aug.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") });
    await page.getByRole("button", { name: "Upload and map columns" }).click();
    await page.getByLabel("Sheet column for Activity unit").selectOption("Unit");
    await page.getByRole("button", { name: "Preview rows" }).click();
    await page.getByRole("button", { name: "Import 2 rows" }).click();

    // The same plan and version would be refused again, so the only way on is a fresh preview.
    await expect(page.getByText("Some rows changed since the preview.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    const previews = ai.filter((c) => c.path.endsWith("/preview")).length;
    await page.getByRole("button", { name: "Back to preview" }).click();
    await expect(page.locator("[aria-current=step]")).toContainText("Preview");
    await expect.poll(() => ai.filter((c) => c.path.endsWith("/preview")).length).toBe(previews + 1);
  } finally {
    importAnswer = null;
  }
});

test("a superadmin previews a historical sheet, imports it and sees the invite warning", async ({ page }) => {
  const { historical } = await signIn(page);
  await page.goto("/capture/upload");
  await page.getByRole("button", { name: "Historical import" }).click();
  await expect(page.getByRole("heading", { name: "Historical import" })).toBeVisible();
  await expect(page).toHaveURL(/mode=historical/);

  const previewButton = page.getByRole("button", { name: "Preview rows" });
  await expect(previewButton).toBeDisabled();
  await page.getByLabel("Client").selectOption({ label: "Midal Cables" });
  const site = page.getByRole("combobox", { name: "Site" });
  await site.click();
  await page.getByRole("option", { name: "Hidd" }).click();
  await page.getByLabel("Category").selectOption({ label: "Fuel" });
  await page.locator('input[type="file"]').setInputFiles({ name: "history.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") });
  await previewButton.click();

  await expect(page.getByText("2 rows. 1 will be imported, 1 skipped.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Preview of the historical rows" })).toContainText("Same month as row 1");
  await expect(page.getByText("1 person will get an account at Hidd and an invite email: new@example.com.")).toBeVisible();
  expect(historical).toHaveLength(1);
  for (const field of ["companyId", "siteId", "categoryId"]) expect(historical[0]).toContain(`name="${field}"`);
  expect(historical[0]).not.toContain('name="commit"');

  await page.getByRole("button", { name: "Import 1 row" }).click();
  await expect(page.getByText("Imported 1 row for Hidd, Fuel.")).toBeVisible();
  await expect(page.getByText("Some invites weren't sent")).toBeVisible();
  expect(historical[1]).toContain('name="commit"');
  // No password is ever shown.
  await expect(page.getByText(/password/i)).toHaveCount(0);
});

test("SE-1: a contributor's preview shows entered values and tCO₂e only; a superadmin's shows the factor", async ({ page }) => {
  await signIn(page, "User", CONTRIBUTOR);
  await page.goto("/capture/upload?site=1&category=1&period=2026-08");
  await page.locator('input[type="file"]').setInputFiles({ name: "fuel-aug.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") });
  await page.getByRole("button", { name: "Upload and map columns" }).click();
  await expect(page.locator("[aria-current=step]")).toContainText("Map columns");
  await expect(page.getByText("Picks the emission factor for each row.")).toHaveCount(0);
  await expect(page.getByText("What each row is, for example Diesel.")).toBeVisible();
  await page.getByLabel("Sheet column for Activity unit").selectOption("Unit");
  await page.getByRole("button", { name: "Preview rows" }).click();
  const table = page.getByRole("table", { name: "Preview of the rows to import" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("columnheader", { name: "tCO₂e" })).toBeVisible();
  for (const name of ["Factor used", "Factor"]) await expect(table.getByRole("columnheader", { name, exact: true })).toHaveCount(0);
  await expect(table).toContainText("Won't import: We can't work this row out yet. Ask your administrator.");
  await expect(table).not.toContainText("emission factor");
});

test("the Add data link opens bulk upload for a contributor's own site", async ({ page }) => {
  await signIn(page, "User", CONTRIBUTOR);
  await page.goto("/capture/upload?site=1&category=1&period=2026-08");
  await expect(page.getByRole("heading", { name: "Bulk upload" })).toBeVisible();
  await expect(page.getByLabel("Client")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Historical import" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Site" })).toHaveValue("Hidd");
  await page.locator('input[type="file"]').setInputFiles({ name: "fuel-aug.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("x") });
  await page.getByRole("button", { name: "Upload and map columns" }).click();
  await expect(page.locator("[aria-current=step]")).toContainText("Map columns");
});
