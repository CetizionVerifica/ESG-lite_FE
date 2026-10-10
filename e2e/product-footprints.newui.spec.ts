import { type Page, expect, test } from "@playwright/test";

/**
 * C01 Product footprints smoke tests (VITE_NEW_UI=1 server). Studies,
 * reconciliation, products and approved production are answered locally.
 * Placeholder numbers only; they are not Midal data.
 */

const company = { company_id: 1, name: "Midal Cables" };
const SITE = { site_id: 1, name: "Bahrain" };
const user = { name: "Mia Manager", email: "mia@example.com", sites: [{ ...SITE, company }] };

const PRODUCTS = [
  { product_id: 5, name: "EC-grade wire rod 9.5 mm", unit: "t", site: SITE },
  { product_id: 6, name: "AAAC conductor", unit: "t", site: SITE },
  { product_id: 7, name: "Copper rod 8 mm", unit: "t", site: SITE },
];

function study(id: number, productId: number, version: number, status: string, total: number, extra: Record<string, unknown> = {}) {
  const p = PRODUCTS.find((x) => x.product_id === productId)!;
  return {
    pcf_study_id: id,
    company_id: 1,
    product: { product_id: p.product_id, name: p.name, declared_unit: "kg", declared_unit_qty: 1, mass_per_unit_kg: 1 },
    site: SITE,
    reference_start: "2025-01-01",
    reference_end: "2025-12-31",
    year_type: "CY",
    pcr_tag: "EN 50693",
    version,
    status,
    stale: false,
    updated_at: `2026-0${version}-10T08:00:00Z`,
    result: {
      total_kg_per_unit: total,
      by_stage: { A1: total * 0.8, A2: total * 0.05, A3_energy: total * 0.12, A3_packaging: total * 0.02, A3_waste: total * 0.01 },
      hidden_stages: [],
      primary_data_share_pct: 40,
      dqr_overall: 2.1,
      warnings: [],
      is_draft: false,
      calculated_at: "2026-02-10T08:00:00Z",
    },
    ...extra,
  };
}

const STUDIES = [
  study(10, 5, 1, "superseded", 2.2),
  study(11, 5, 2, "published", 2.0),
  // A newer version in progress doesn't hide the published one.
  study(12, 5, 3, "draft", 1.9),
  study(31, 7, 1, "approved", 3.5, { stale: true }),
];

async function signIn(page: Page, opts: { production?: boolean; products?: boolean } = {}) {
  const asked: string[] = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (/\/products\/site\/1$/.test(path)) return json(opts.products === false ? [] : PRODUCTS);
      if (path.endsWith("/pcf/studies")) {
        asked.push(`studies:${url.searchParams.get("siteId")}`);
        return json(STUDIES);
      }
      if (path.endsWith("/pcf/reconciliation")) {
        asked.push(`recon:${url.searchParams.get("siteId")}:${url.searchParams.get("start")}:${url.searchParams.get("end")}`);
        return json({
          site_id: 1,
          start: url.searchParams.get("start"),
          end: url.searchParams.get("end"),
          plant_s1_s2_tco2e: 1000,
          covered_tco2e: 960,
          coverage_pct: 96,
          products: [{ product_id: 5, product_name: PRODUCTS[0].name, pcf_study_id: 11, version: 2, status: "published", stale: false, covered_tco2e: 960, share_pct: 96 }],
          excluded: [],
        });
      }
      if (path.endsWith("/user/production-data/manager")) {
        asked.push(`production:${url.searchParams.get("siteId")}:${url.searchParams.get("status")}`);
        if (opts.production === false) return json([]);
        return json(
          PRODUCTS.map((p, i) => ({
            production_id: i + 1,
            quantity: [3000, 1000, 1000][i],
            unit: "t",
            start_date: "2025-01-01",
            end_date: "2025-12-31",
            status: "approved",
            product: { product_id: p.product_id, name: p.name, unit: "t" },
            site: SITE,
          })),
        );
      }
      return json({});
    },
  );
  return { asked };
}

const table = (page: Page) => page.getByRole("table", { name: "Product footprints" });

test("shows the portfolio for the year with KPIs that filter the table", async ({ page }) => {
  const { asked } = await signIn(page);
  await page.goto("/products?period=CY2025");

  await expect(page.getByRole("heading", { name: "Product footprints" })).toBeVisible();
  const rows = table(page).locator("tbody tr");
  await expect(rows).toHaveCount(3);
  const wire = rows.filter({ hasText: "EC-grade wire rod 9.5 mm" });
  await expect(wire).toContainText("2.00");
  await expect(wire).toContainText("▼ 9.1%");
  await expect(wire).toContainText("Published");
  await expect(wire).toContainText("v3 draft");
  await expect(rows.filter({ hasText: "Copper rod 8 mm" })).toContainText("Out of date");
  await expect(rows.filter({ hasText: "AAAC conductor" })).toContainText("No footprint");

  // 2 of 3 products with approved production have a usable footprint; 4,000 of 5,000 t covered.
  await expect(page.getByText("1 out of date")).toBeVisible();
  await expect(page.getByText("80%")).toBeVisible();
  await expect(page.getByText("Bahrain plant energy is 96% allocated. AAAC conductor has no footprint yet.")).toBeVisible();
  expect(asked).toContain("studies:1");
  expect(asked).toContain("production:1:approved");
  expect(asked).toContain("recon:1:2025-01-01:2025-12-31");

  await page.getByRole("button", { name: "Plant energy allocated: show only these" }).click();
  await expect(rows).toHaveCount(1);
  await expect(page).toHaveURL(/kpi=allocated/);
  await page.getByRole("button", { name: "Plant energy allocated: show all" }).click();
  await expect(rows).toHaveCount(3);

  await rows.filter({ hasText: "AAAC conductor" }).getByRole("link", { name: "Start a footprint for AAAC conductor" }).click();
  await expect(page).toHaveURL(/\/products\/new\?product=6&site=1/);
  await page.goBack();
  await rows.filter({ hasText: "EC-grade wire rod 9.5 mm" }).click();
  await expect(page).toHaveURL(/\/products\/11$/);
});

test("explains that footprints need approved production", async ({ page }) => {
  await signIn(page, { production: false });
  await page.goto("/products?period=CY2025");
  await expect(page.getByText("No approved production for CY 2025")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review production data" })).toHaveAttribute("href", "/data/production?period=CY2025&status=approved");
});

test("asks the admin for products when the sites have none", async ({ page }) => {
  await signIn(page, { products: false });
  await page.goto("/products");
  await expect(page.getByText("Ask your admin to add products.")).toBeVisible();
});
