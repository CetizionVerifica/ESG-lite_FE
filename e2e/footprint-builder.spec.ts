import { type Page, expect, test } from "@playwright/test";

/**
 * C02 Footprint builder smoke tests. The PCF API is
 * answered locally. Placeholder numbers only; they are not Midal data.
 */

const company = { company_id: 1, name: "Midal Cables" };
const SITE = { site_id: 1, name: "Bahrain" };
const user = {
  name: "Mia Manager",
  email: "mia@example.com",
  sites: [{ ...SITE, company, categories: [{ category_id: 9, category_name: "Upstream transport", scope: "Scope 3" }] }],
};
const PRODUCT = { product_id: 5, name: "EC-grade wire rod 9.5 mm", unit: "t", site: SITE };

function study(id: number, version: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    pcf_study_id: id,
    company_id: 1,
    product: { product_id: 5, name: PRODUCT.name, declared_unit: "t", declared_unit_qty: 1, mass_per_unit_kg: 1000 },
    site: SITE,
    reference_start: "2025-01-01",
    reference_end: "2025-12-31",
    year_type: "CY",
    boundary: "cradle_to_gate",
    standard: "iso14067",
    pcr_tag: null,
    allocation_key: "mass",
    cut_off_rule_pct: 1,
    version,
    parent_version_id: version > 1 ? id - 1 : null,
    status,
    stale: false,
    notes: null,
    review_comment: null,
    updated_at: "2026-02-10T08:00:00Z",
    inputs: [
      {
        pcf_input_id: 70,
        stage: "A1",
        name: "Aluminium ingot",
        sort_order: 0,
        material_factor_id: 1,
        recycled_material_factor_id: null,
        emission_factor_id: null,
        supplier_pcf_kgco2e: null,
        quantity: 1010,
        unit: "kg",
        recycled_share_pct: 0,
        origin_country: "BH",
        supplier_name: null,
        transport_mode: null,
        distance_km: null,
        payload_t: null,
        data_type: "secondary",
        dqr_technology: 2,
        dqr_geography: 2,
        dqr_time: 2,
        ai_suggested: false,
        ai_confidence: null,
      },
    ],
    ...extra,
  };
}

const FACTORS = [
  { material_factor_id: 2, name: "Copper cathode (placeholder)", material_group: "Metals", geography: "GLO", unit: "kg", value_kgco2e: null, value_hidden: true, source: "ecoinvent", source_year: 2023, licence: "ecoinvent", recycled_variant: false },
  { material_factor_id: 1, name: "Aluminium, primary (placeholder)", material_group: "Metals", geography: "GLO", unit: "kg", value_kgco2e: 2, value_hidden: false, source: "Test", source_year: 2024, licence: "open", recycled_variant: false },
];

const PREVIEW = {
  allocation_key: "mass",
  sources: [{ category_id: 3, category_name: "Electricity", scope: 2, period_total_tco2e: 1000, share_pct: 50, allocated_kg_per_unit: 500 }],
  share_pct: 50,
  product_output_units: 1000,
  product_production_t: 1000,
  a3_energy_kg_per_unit: 500,
  plant_s1_s2_tco2e: 1000,
  blockers: [],
  warnings: [],
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
      const url = new URL(req.url());
      const path = url.pathname;
      const method = req.method();
      const json = (body: unknown, status = 200) => route.fulfill({ json: body, status });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (/\/products\/site\/1$/.test(path)) return json([PRODUCT]);
      if (path.endsWith("/pcf/material-factors")) return json(FACTORS);
      if (/\/emission-factors\/site\/1\/category\/9$/.test(path))
        return json([
          { emission_factor_id: 40, emission_category_name: "HGV, average laden", denominator_unit: "tonne.km", factor_value: "0.1", source: "DEFRA", year: 2024 },
          { emission_factor_id: 41, emission_category_name: "Van", denominator_unit: "km", factor_value: "0.2", source: "DEFRA", year: 2024 },
        ]);
      const one = /\/pcf\/studies\/(\d+)(\/[a-z-]+)?$/.exec(path);
      if (one) {
        const s = studies[Number(one[1])];
        if (!s) return json({ message: "Footprint not found" }, 404);
        seen.push({ method, path: one[2] ?? "", body: req.postDataJSON?.() ?? null });
        if (one[2] === "/allocation-preview") return json(PREVIEW);
        if (one[2] === "/inputs") return json({ inputs: (req.postDataJSON() as { inputs: unknown[] }).inputs });
        if (method === "PATCH") return json({ ...s, ...(req.postDataJSON() as object) });
        return json(s);
      }
      if (path.endsWith("/pcf/studies")) {
        if (method === "POST") {
          seen.push({ method, path: "", body: req.postDataJSON() });
          return json(study(13, 3, "draft"), 201);
        }
        return json(Object.values(studies));
      }
      return json({});
    },
  );
  return seen;
}

test("starts a new version copied from the last one and opens the builder", async ({ page }) => {
  const seen = await signIn(page, { 12: study(12, 2, "published"), 13: study(13, 3, "draft") });
  await page.goto("/products/new?site=1&product=5");
  await expect(page.getByRole("heading", { name: "New footprint" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Copy from version 3" })).toBeChecked();
  await page.getByRole("button", { name: "Start footprint" }).click();

  await expect(page).toHaveURL(/\/products\/5\/footprints\/13\/edit$/);
  expect(seen.find((r) => r.method === "POST")?.body).toMatchObject({ product_id: 5, site_id: 1, year_type: "CY", copy_from_id: 13 });
  await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
  // 1010 kg × 2 kg/kg + 500 kg allocated plant energy.
  await expect(page.getByLabel("Running total")).toContainText("2,520");
  await expect(page.getByRole("button", { name: "Calculate" })).toBeEnabled();
});

test("autosaves scope changes and moves through the steps", async ({ page }) => {
  const seen = await signIn(page, { 13: study(13, 3, "draft") });
  await page.goto("/products/5/footprints/13/edit");
  await page.getByLabel("PCR tag").fill("EN 50693");
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  expect(seen.some((r) => r.method === "PATCH" && (r.body as { pcr_tag?: string }).pcr_tag === "EN 50693")).toBe(true);

  await page.getByRole("button", { name: /Next: Materials/ }).click();
  await expect(page).toHaveURL(/step=materials/);
});

test("a footprint in review can't be edited", async ({ page }) => {
  await signIn(page, { 12: study(12, 2, "in_review") });
  await page.goto("/products/5/footprints/12/edit");
  await expect(page.getByText("This footprint is in review, so it can't be edited.")).toBeVisible();
});

test("adds a material and its transport leg; the total follows both", async ({ page }) => {
  const seen = await signIn(page, { 13: study(13, 3, "draft") });
  await page.goto("/products/5/footprints/13/edit?step=materials");
  await expect(page.getByRole("heading", { name: "Materials (A1)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import BOM" })).toBeDisabled();

  await page.getByRole("button", { name: "Add material" }).first().click();
  await page.getByLabel("Name, row 2").fill("Magnesium");
  await page.getByLabel("Quantity, row 2").fill("5");
  await page.getByLabel("Factor, row 2").click();
  await page.getByRole("option", { name: /Aluminium, primary .* Test 2024 · 2 kg\/kg/ }).click();
  // 1010 kg + 5 kg at 2 kg/kg, plus 500 kg plant energy.
  await expect(page.getByLabel("Running total")).toContainText("2,530");
  await expect.poll(() => seen.some((r) => r.path === "/inputs" && (r.body as { inputs: unknown[] }).inputs.length === 2)).toBe(true);

  // Licensed factors say the value is hidden.
  await page.getByLabel("Factor, row 2").click();
  await expect(page.getByRole("option", { name: /Copper cathode .* ecoinvent 2023 · value hidden \(licensed\)/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Next: Inbound transport/ }).click();
  await page.getByRole("button", { name: "Add leg" }).first().click();
  await page.getByLabel("Material, leg 1").selectOption("Aluminium ingot");
  await expect(page.getByRole("cell", { name: "1.01 t" })).toBeVisible();
  await page.getByLabel("Distance, leg 1").fill("100");
  await page.getByLabel("Factor, leg 1").click();
  await expect(page.getByRole("option", { name: /Van/ })).toHaveCount(0);
  await page.getByRole("option", { name: /HGV, average laden · DEFRA 2024/ }).click();
  // + 1.01 t × 100 km × 0.1 = 10.1 kg.
  await expect(page.getByLabel("Running total")).toContainText("2,540.1");
});
