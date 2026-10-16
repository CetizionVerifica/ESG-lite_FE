import { type Page, expect, test } from "@playwright/test";

/**
 * S3-10 sold products smoke test: add a sale, set the cable's end-of-life mix
 * (90 % landfill, 10 % incineration, shown live), create the Category 12 plan
 * and see one row per treatment, then import it. The endpoints answer like the
 * server; the page never sends a total.
 */
type Call = { method: string; path: string; body: Record<string, unknown> };

const PRODUCT = {
  product_id: 9401,
  name: "Cable drum",
  unit: "drum",
  declared_unit: null,
  site_id: 4,
  site_name: "Plant 1",
  mass_per_unit_kg: 2,
  lifetime_uses: null,
  eol_mix: null as null | Array<{ treatment: string; share: number }>,
  use_profile: null,
};

async function signIn(page: Page, opts: { sales?: boolean } = {}) {
  const calls: Call[] = [];
  const user = { name: "Mona Manager", email: "mona@example.com" };
  const sales = opts.sales
    ? [{ id: 1, product_id: 9401, product: "Cable drum", site_id: 4, period: "2026-03-01", quantity: 1500, unit: "drum", region: "India", mass_kg: 3000 }]
    : [];
  const product = { ...PRODUCT };
  await page.addInitScript(
    ([u]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", "Manager");
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user)] as const,
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });

      if (path.endsWith("/scope3/product-sales") && method === "GET")
        return json({
          company_id: 1,
          year: 2026,
          year_type: "CY",
          sites: [{ site_id: 4, name: "Plant 1", categories: { 10: null, 11: 20, 12: 21 } }],
          products: [product],
          sales,
        });
      if (path.endsWith("/scope3/product-sales") && method === "POST") {
        const added = (body.sales as Array<Record<string, unknown>>) ?? [];
        for (const s of added) sales.push({ id: sales.length + 1, product_id: 9401, product: "Cable drum", site_id: 4, period: `${s.period}-01`, quantity: Number(s.quantity), unit: String(s.unit), region: (s.region as string) ?? null, mass_kg: Number(s.quantity) * 2 });
        return json({ created: added.length, updated: 0, unchanged: 0 }, 201);
      }
      if (path.endsWith("/scope3/products/9401/use-profile")) {
        product.eol_mix = body.eol_mix as typeof product.eol_mix;
        return json({ ...product });
      }
      if (path.endsWith("/scope3/sold-products/plan")) {
        // 3,000 kg aluminium × 90 % × 1 and × 10 % × 2 (CI factors), stored to 2 dp t.
        const row = (t: string, share: number, total: number) => ({
          row_ref: `sold-12-9401-1-${t.toLowerCase()}`,
          state: "ready",
          issues: [],
          input: { activity_name: `Aluminium|${t}`, activity_unit: "kg", fields: { "@method": "waste_type_specific", "Product name": "Cable drum", "Mass at end of life (kg)": 3000, "Share treated this way (%)": share } },
          result: { total_tco2e: total },
        });
        const rows = [row("Landfill", 90, 2.7), row("Incineration", 10, 0.6)];
        return json(
          {
            plan: { plan_id: "plan-12", version: 1, status: "draft", counts: { rows: 2, ready: 2, issue: 0, skipped: 0, warnings: 0 }, totals: { tco2e: 3.3 }, rows },
            planned: [{ product_id: 9401, row_refs: rows.map((r) => r.row_ref), method: "waste_type_specific" }],
            skipped: [],
            products_sold: 1,
          },
          201,
        );
      }
      if (path.endsWith("/imports/plans/plan-12/commit"))
        return json({ plan_id: "plan-12", status: "committed", committed: { upload_batch_id: "b12", inserted: 2, committed_at: "2026-10-16T10:00:00Z" } });
      return json({});
    },
  );
  return { calls };
}

test("a manager adds a sale, sets the end-of-life mix and imports the Category 12 plan", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/settings/scope3/sold-products?year=2026");
  await expect(page.getByRole("heading", { name: "Sold products" })).toBeVisible();
  await expect(page.getByText("No sales recorded for 2026")).toBeVisible();

  // Add a sale.
  await page.getByRole("button", { name: "Add sale" }).first().click();
  const sale = page.getByRole("dialog", { name: "Add sale" });
  await sale.getByRole("combobox", { name: /Month/ }).first().selectOption("3");
  await sale.getByRole("textbox", { name: /Quantity/ }).fill("1500");
  await sale.getByRole("textbox", { name: /Region/ }).fill("India");
  await sale.getByRole("button", { name: "Add sale" }).click();
  await expect(page.getByText("Sale added")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ path: expect.stringMatching(/\/scope3\/product-sales$/), body: { sales: [{ product_id: 9401, period: "2026-03", quantity: 1500, unit: "drum", region: "India" }] } });

  // End-of-life mix: the total is shown as it is typed.
  await page.getByRole("table", { name: "Product data" }).getByText("Cable drum").click();
  const drawer = page.getByRole("dialog", { name: "Cable drum" });
  await drawer.getByRole("textbox", { name: /^Landfill/ }).fill("90");
  await expect(drawer.getByTestId("eol-total")).toHaveText("Total 90 % of 100 %");
  await drawer.getByRole("button", { name: "Save product" }).click();
  await expect(drawer.getByText("Shares must add up to 100 % (now 90 %).")).toBeVisible();
  await drawer.getByRole("textbox", { name: /^Incineration/ }).fill("10");
  await expect(drawer.getByTestId("eol-total")).toHaveText("Total 100 % of 100 %");
  await drawer.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Cable drum saved")).toBeVisible();
  expect(calls.at(-1)?.body.eol_mix).toEqual([
    { treatment: "landfill", share: 0.9 },
    { treatment: "incineration", share: 0.1 },
  ]);

  // Category 10 isn't assigned on this site.
  await expect(page.getByRole("button", { name: "Create Category 10 plan" })).toBeDisabled();
  await page.getByRole("button", { name: "Create Category 12 plan" }).click();
  const plan = page.getByTestId("plan-preview");
  await expect(plan.getByTestId("plan-row")).toHaveCount(2);
  await expect(plan).toContainText("Aluminium · Landfill");
  await expect(plan).toContainText("Aluminium · Incineration");
  expect(calls.at(-1)).toMatchObject({ path: expect.stringMatching(/\/scope3\/sold-products\/plan$/), body: { site_id: 4, year: 2026, year_type: "CY", ghg_category: 12 } });
  // The page sends sales and shares, never a total.
  expect(JSON.stringify(calls)).not.toMatch(/total_tco2e|tco2e/);

  await page.getByRole("button", { name: "Import 2 rows as Pending" }).click();
  await expect(page.getByText("2 rows imported as Pending")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ path: expect.stringMatching(/\/imports\/plans\/plan-12\/commit$/), body: { version: 1, skip_rows_with_issues: true } });
});

test("a sales sheet with an unknown product says which row", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/scope3/sold-products?year=2026");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from("Product,Month,Quantity,Unit\nMystery,2026-01,4,unit") });
  await expect(page.getByText('Row 2: "Mystery" isn\'t one of the products on your sites.')).toBeVisible();
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal page scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, { sales: true });
    await page.goto("/settings/scope3/sold-products?year=2026");
    await expect(page.getByRole("table", { name: "Sales for 2026" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
