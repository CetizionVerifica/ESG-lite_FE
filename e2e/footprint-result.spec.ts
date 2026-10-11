import { type Page, expect, test } from "@playwright/test";

/**
 * C03 Footprint result smoke tests. The PCF API is answered locally.
 * Placeholder numbers only; they are not Midal data.
 */

const company = { company_id: 1, name: "Midal Cables" };
const SITE = { site_id: 1, name: "Bahrain" };
const user = { name: "Mia Manager", email: "mia@example.com", sites: [{ ...SITE, company, categories: [] }] };

function study(id: number, version: number, status: string, total: number | null, extra: Record<string, unknown> = {}) {
  return {
    pcf_study_id: id,
    company_id: 1,
    product: { product_id: 5, name: "EC-grade wire rod 9.5 mm", declared_unit: "kg", declared_unit_qty: 1, mass_per_unit_kg: 1 },
    site: SITE,
    reference_start: "2025-01-01",
    reference_end: "2025-12-31",
    year_type: "CY",
    boundary: "cradle_to_gate",
    standard: "iso14067",
    pcr_tag: null,
    allocation_key: "mass",
    version,
    parent_version_id: version > 1 ? id - 1 : null,
    status,
    stale: false,
    created_by: { user_id: 2, name: "Mia Manager" },
    reviewed_by: null,
    reviewed_at: null,
    review_comment: null,
    updated_at: "2026-02-10T08:00:00Z",
    result:
      total == null
        ? null
        : { total_kg_per_unit: total, by_stage: { A1: 6.5, A3_energy: 0.2 }, hidden_stages: [], primary_data_share_pct: 38, dqr_overall: 1.8, warnings: [], is_draft: status === "draft", calculated_at: "2026-02-10T08:00:00Z" },
    ...extra,
  };
}

const RESULT = {
  pcf_study_id: 12,
  total_kg_per_unit: 7.2,
  by_stage: { A1: 6.5, A2: 0.4, A3_energy: 0.2, A3_packaging: 0.1, A3_waste: 0 },
  hidden_stages: [],
  primary_data_share_pct: 38,
  dqr: { technology: 1.8, geography: 1.8, time: 1.8, overall: 1.8 },
  recycled_input_pct: 20,
  lines: [
    {
      id: "in-70", pcf_input_id: 70, stage: "A1", name: "Primary aluminium", kgco2e_per_unit: 6.5, share_pct: 90.3, value_hidden: false, data_type: "secondary",
      dqr: { technology: 2, geography: 2, time: 2 }, cut_off_candidate: false, quantity: 1, unit: "kg", recycled_share_pct: 20, supplier_specific: false,
      factor: { name: "Aluminium, primary (placeholder)", unit: "kg", source: "Test", licence: "open", value_kgco2e: 8 },
      recycled_factor: { name: "Aluminium, recycled (placeholder)", unit: "kg", source: "Test", licence: "open", value_kgco2e: 0.5 },
      lever_kg_per_10pts: -0.75,
    },
    {
      id: "in-71", pcf_input_id: 71, stage: "A2", name: "Truck to plant", kgco2e_per_unit: 0.4, share_pct: 5.6, value_hidden: false, data_type: "secondary",
      dqr: { technology: 2, geography: 2, time: 2 }, cut_off_candidate: false, quantity: 1, unit: "t", recycled_share_pct: 0, supplier_specific: false,
      factor: { name: "HGV", unit: "tonne.km", source: "DEFRA", licence: null, value_kgco2e: 0.1 }, recycled_factor: null, lever_kg_per_10pts: null,
    },
  ],
  cut_off: { below_threshold_ids: [], below_threshold_total_pct: 0, within_limit: true },
  allocation: { share_pct: 40, product_output_units: 120000000, key: "mass", key_value_product: 120000, key_value_site_total: 300000 },
  allocations: [{ pcf_allocation_id: 1, category_id: 3, category_name: "Electricity", scope: 2, period_total_tco2e: 1000, share_pct: 40, allocated_kg_per_unit: 0.2 }],
  emission_ids_used: [101, 102],
  production_ids_used: [9],
  warnings: [],
  is_draft: false,
  engine_version: "pcf-1.0.0",
  calculated_at: "2026-02-10T08:00:00Z",
  calculated_by: { user_id: 2, name: "Mia Manager" },
};

type Seen = { method: string; path: string; body: unknown }[];

async function signIn(page: Page, studies: Record<number, ReturnType<typeof study>>) {
  const seen: Seen = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const method = req.method();
      const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      const one = /\/pcf\/studies\/(\d+)(\/[a-z-]+)?$/.exec(path);
      if (one) {
        const s = studies[Number(one[1])];
        if (!s) return json({ message: "Footprint not found" }, 404);
        seen.push({ method, path: one[2] ?? "", body: req.postDataJSON?.() ?? null });
        if (one[2] === "/result") return s.result ? json({ ...RESULT, pcf_study_id: s.pcf_study_id }) : json({ message: "Not calculated" }, 404);
        if (one[2] === "/audit") return json([]);
        if (one[2] === "/publish") return json(Object.assign(s, { status: "published" }));
        if (one[2] === "/approve") return json({ message: "Someone other than whoever created or calculated this footprint must approve it" }, 403);
        return json(s);
      }
      if (path.endsWith("/pcf/studies")) {
        if (method === "POST") {
          seen.push({ method, path: "", body: req.postDataJSON() });
          return json(study(14, 4, "draft", null), 201);
        }
        return json(Object.values(studies));
      }
      return json({});
    },
  );
  return seen;
}

test("shows the latest approved version with KPIs, hotspots and inputs", async ({ page }) => {
  await signIn(page, { 11: study(11, 1, "superseded", 7.5), 12: study(12, 2, "approved", 7.2), 13: study(13, 3, "draft", null) });
  await page.goto("/products/5");
  await expect(page.getByRole("heading", { name: "EC-grade wire rod 9.5 mm" })).toBeVisible();
  await expect(page.getByText("v2 · CY 2025")).toBeVisible();
  await expect(page.getByText("7.200", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("vs v1")).toBeVisible();
  await expect(page.getByText("Each +10 pts of recycled input lowers the footprint by about 0.75 kgCO₂e per kg.")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Aluminium, primary \(placeholder\) · Test · 8 kg\/kg/ })).toBeVisible();

  await page.getByRole("tab", { name: "Plant energy allocation" }).click();
  await expect(page).toHaveURL(/tab=allocation/);
  await expect(page.getByRole("link", { name: "Electricity" })).toHaveAttribute("href", /\/data\/ledger\?site=1&.*status=approved&category=3/);
  await expect(page.getByText("Uses 2 approved emission entries and 1 approved production record.")).toBeVisible();
});

test("publishes an approved footprint and starts a new version", async ({ page }) => {
  const seen = await signIn(page, { 12: study(12, 2, "approved", 7.2) });
  await page.goto("/products/5/footprints/12");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Footprint published.")).toBeVisible();
  expect(seen.some((r) => r.path === "/publish")).toBe(true);

  await page.getByRole("button", { name: "New version" }).click();
  await expect(page).toHaveURL(/\/products\/5\/footprints\/14\/edit$/);
  expect(seen.find((r) => r.method === "POST" && r.path === "")?.body).toEqual({ copy_from_id: 12 });
});

test("an out-of-date footprint says so and a refused approval shows why", async ({ page }) => {
  await signIn(page, { 12: study(12, 2, "approved", 7.2, { stale: true }), 15: study(15, 3, "in_review", 7.1) });
  await page.goto("/products/5/footprints/12");
  await expect(page.getByText("New approved data since this was calculated. Recalculate as v4.")).toBeVisible();

  await page.goto("/products/5/footprints/15");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Someone other than whoever created or calculated this footprint must approve it")).toBeVisible();
});

test("a product without a footprint offers to start one, at 390px too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, {});
  await page.goto("/products/5");
  await expect(page.getByText("This product has no footprint yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start footprint" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
