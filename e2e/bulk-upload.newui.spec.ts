import { type Page, expect, test } from "@playwright/test";

/**
 * P27 Bulk upload smoke test (VITE_NEW_UI=1 server). The backend and the AI
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

const PREVIEW = [
  { emission_category: "Diesel", activity_value: "100", activity_data_unit: "litres", global_category_name: "Diesel", factor_value: 0.00268, denominator_unit: "litres", total_emission: 0.268, date_of_reporting: "2026-08-31" },
  { emission_category: "Petrol", activity_value: "50", activity_data_unit: "litres", global_category_name: "Petrol", factor_value: 0.00231, denominator_unit: "litres", total_emission: 0.1155, date_of_reporting: "2026-08-31" },
  { emission_category: "Biogas", activity_value: "10", activity_data_unit: "m3", global_category_name: null, factor_value: null, denominator_unit: null, total_emission: 0, date_of_reporting: "2026-08-31" },
];

async function signIn(page: Page) {
  const ai: Array<{ path: string; body: unknown }> = [];
  const user = { user_id: 9, name: "Sam Staff", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
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
        if (path.endsWith("/preview")) return json({ rows: PREVIEW, total_rows: 3, page: 1, page_size: 100 });
        if (path.endsWith("/import")) return json({ inserted: 3, skipped: 0, total_rows: 3, upload_batch_id: "b-1", skipped_rows: [] });
      }

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/column-configs/site/1/category/1")) return json([FUEL_FORM]);
      return json({});
    },
  );
  return { ai };
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

  // Preview: one row has no factor and shows under Issues.
  const table = page.getByRole("table", { name: "Preview of the rows to import" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(page.getByText("3 rows. 2 look right, 1 need a look.")).toBeVisible();
  await page.getByRole("radio", { name: "Issues (1)" }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText('No factor for "Biogas"');

  await page.getByRole("button", { name: "Import 3 rows" }).click();
  await expect(page.getByText("Imported 3 rows.")).toBeVisible();
  await expect(page.getByText("Rows arrive as Pending")).toBeVisible();

  const sent = ai.find((c) => c.path.endsWith("/import"))?.body as Record<string, unknown>;
  expect(sent).toMatchObject({
    document_id: 42,
    selected_categories: [],
    site_id: 1,
    category_id: 1,
    date_of_reporting: "2026-08-31",
    user_id: 9,
  });
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
