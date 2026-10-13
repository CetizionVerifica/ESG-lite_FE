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
      // The AI assist (E2). parse-bom is a multipart upload, so it is answered before any JSON body is read.
      if (path.endsWith("/v1/pcf/parse-bom")) {
        const data = req.postData() ?? "";
        const part = (name: string) => new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`).exec(data)?.[1] ?? null;
        seen.push({ method, path: "/parse-bom", body: { batch_units: part("batch_units"), study_id: part("study_id"), keep_evidence: part("keep_evidence") } });
        const reread = part("keep_evidence") === "false";
        return json({
          file_name: "bom.xlsx",
          sheet_names: ["BOM"],
          sheet_name: "BOM",
          header_line: 1,
          headers: ["Item", "Qty", "UoM", "Vendor"],
          mapping: {
            name: { header: "Item", confidence: 95, reason: "Header “Item” is the material column", by: "header" },
            quantity: { header: "Qty", confidence: 95, reason: "Header “Qty” is the quantity column", by: "header" },
            unit: { header: "UoM", confidence: 95, reason: "Header “UoM” is the unit column", by: "header" },
            supplier_name: { header: "Vendor", confidence: 95, reason: "Header “Vendor” is the supplier column", by: "header" },
          },
          batch_units: 25,
          lines: [
            { line: 2, values: { stage: "A1", name: "EC-grade aluminium ingot", quantity: 1020, unit: "kg", supplier_name: "Alba", origin_country: null, recycled_share_pct: 0, data_type: "secondary" }, confidence: 92, reason: "Row 2, quantities divided by 25", warnings: [], problems: [], by: "sheet" },
            { line: 3, values: { stage: "A3_packaging", name: "Wooden drum", quantity: 0.04, unit: "unit", supplier_name: null, origin_country: null, recycled_share_pct: 0, data_type: "secondary" }, confidence: 55, reason: "Packaging word in the name", warnings: ["Stage guessed from the name"], problems: [], by: "sheet" },
          ],
          total_lines: 2,
          lines_with_problems: 0,
          low_confidence_lines: 1,
          warnings: [],
          ai_used: false,
          evidence: reread ? null : { id: 7, document_name: "bom.xlsx", url: "http://localhost/evidence/7", stored: "local" },
        });
      }
      if (path.endsWith("/v1/pcf/match-factors")) {
        const body = req.postDataJSON() as { lines: { id: string; name: string }[]; factors: unknown[]; geography_hint: string | null };
        seen.push({ method, path: "/match-factors", body });
        return json({
          lines: body.lines.map((l) =>
            /aluminium/i.test(l.name)
              ? { id: l.id, name: l.name, unmatched: false, suggestions: [{ material_factor_id: 1, name: "Aluminium, primary (placeholder)", confidence: 84, reason: "“EC-grade aluminium ingot” → Aluminium, primary, same group (aluminium), GLO dataset, Test 2024", by: "rule" }] }
              : { id: l.id, name: l.name, unmatched: true, suggestions: [{ material_factor_id: 2, name: "Copper cathode (placeholder)", confidence: 22, reason: "nothing closer in the library", by: "rule" }] },
          ),
          total_lines: body.lines.length,
          unmatched_lines: body.lines.filter((l) => !/aluminium/i.test(l.name)).length,
          ai_used: false,
        });
      }
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
        if (one[2] === "/calculate") {
          Object.assign(s, { result: { total_kg_per_unit: 2520, by_stage: { A1: 2020, A3_energy: 500 }, hidden_stages: [], primary_data_share_pct: 19.8, dqr_overall: 1.8, warnings: [], is_draft: true, calculated_at: "2026-10-10T08:00:00Z" } });
          return json({
            result: {
              total_kg_per_unit: 2520,
              by_stage: { A1: 2020, A3_energy: 500 },
              hidden_stages: [],
              lines: [{ id: "in-70", stage: "A1", name: "Aluminium ingot", kgco2e_per_unit: 2020, data_type: "secondary", pcf_input_id: 70 }],
              cut_off: { below_threshold_ids: [], below_threshold_total_pct: 0, within_limit: true },
              primary_data_share_pct: 19.8,
              dqr: { technology: 1.8, geography: 1.8, time: 1.8, overall: 1.8 },
            },
            warnings: [],
          });
        }
        if (one[2] === "/submit") return json({ ...s, status: "in_review" });
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

  // C06: the line's details link to "Ask supplier" for a saved input.
  await page.getByLabel("More fields, row 1").click();
  const details = page.getByRole("dialog", { name: "Aluminium ingot" });
  await expect(details.getByRole("link", { name: "Ask the supplier" })).toHaveAttribute("href", "/products/suppliers?new=1&study=13&input=70");
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();

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

test("imports a BOM through the AI reader and accepts a suggested factor", async ({ page }) => {
  const seen = await signIn(page, { 13: study(13, 3, "draft") });
  await page.goto("/products/5/footprints/13/edit?step=materials");
  await page.getByRole("button", { name: "Import BOM" }).click();
  const bom = page.getByRole("dialog", { name: "Import BOM" });
  await bom.getByLabel("Quantities in the file cover").fill("25");
  await bom.locator('input[type="file"]').setInputFiles({ name: "bom.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("not really a workbook") });
  await expect(bom.getByText("2 lines read, quantities divided by 25. 1 read with low confidence: confirm it before Calculate.")).toBeVisible();
  await expect(bom.getByLabel(/^Material\b/)).toHaveValue("Item");
  await expect(bom.getByText("bom.xlsx is kept as evidence for this footprint.")).toBeVisible();
  expect(seen.find((r) => r.path === "/parse-bom")?.body).toEqual({ batch_units: "25", study_id: "13", keep_evidence: null });
  // Changing a column re-reads the file without storing it as evidence again; the first evidence row still shows.
  await bom.getByLabel("Supplier").selectOption("Item");
  await expect.poll(() => seen.filter((r) => r.path === "/parse-bom").length).toBe(2);
  expect(seen.filter((r) => r.path === "/parse-bom").at(-1)?.body).toEqual({ batch_units: "25", study_id: "13", keep_evidence: "false" });
  await expect(bom.getByText("bom.xlsx is kept as evidence for this footprint.")).toBeVisible();
  await bom.getByRole("button", { name: "Add 2 lines" }).click();
  await expect(bom).toBeHidden();
  await expect(page.getByText("Added 2 lines from bom.xlsx.")).toBeVisible();

  // The lines arrive AI-suggested; the low-confidence one blocks Calculate until confirmed.
  await expect(page.getByLabel("Name, row 2")).toHaveValue("EC-grade aluminium ingot");
  await expect(page.getByText("AI 92%")).toBeVisible();
  await expect(page.getByLabel("Running total")).toContainText("Confirm 1 AI line");

  // Suggest factors: the ingot gets a match, the drum is left for the person.
  await page.getByRole("button", { name: "Suggest factors" }).click();
  const suggest = page.getByRole("dialog", { name: "Suggest factors" });
  await expect(suggest.getByText("1 of 2 lines have a close match; 1 needs picking by hand.")).toBeVisible();
  await expect(suggest.getByText(/same group \(aluminium\)/)).toBeVisible();
  const match = seen.find((r) => r.path === "/match-factors")?.body as { lines: { name: string }[]; factors: { material_factor_id: number }[]; geography_hint: string | null };
  expect(match.lines.map((l) => l.name)).toEqual(["EC-grade aluminium ingot", "Wooden drum"]);
  expect(match.factors.map((f) => f.material_factor_id)).toEqual([2, 1]);
  expect(match.geography_hint).toBe("Bahrain");
  await suggest.getByRole("button", { name: "Apply 1 factor" }).click();
  await expect(suggest).toBeHidden();
  // (1010 kg + 1020 kg) at 2 kg/kg, plus 500 kg plant energy.
  await expect(page.getByLabel("Running total")).toContainText("4,560");
  await expect.poll(() => {
    const last = seen.filter((r) => r.path === "/inputs").at(-1)?.body as { inputs: { name: string; ai_suggested: boolean; ai_confidence: number | null; material_factor_id: number | null }[] } | undefined;
    return last?.inputs.find((i) => i.name === "EC-grade aluminium ingot");
  }).toMatchObject({ ai_suggested: true, ai_confidence: 0.84, material_factor_id: 1 });
});

test("shows the allocated plant energy, then calculates and sends for review", async ({ page }) => {
  const seen = await signIn(page, { 13: study(13, 3, "draft") });
  await page.goto("/products/5/footprints/13/edit?step=energy");
  await expect(page.getByRole("heading", { name: "Plant energy (A3)" })).toBeVisible();
  const row = page.getByRole("row", { name: /Electricity/ });
  await expect(row).toContainText("Scope 2");
  await expect(row).toContainText("50%");
  await expect(page.getByRole("link", { name: "Review production data" })).toHaveAttribute("href", /\/data\/production\?site=1&period=CY2025&status=approved/);

  await page.getByRole("button", { name: /Next: Packaging/ }).click();
  await expect(page.getByRole("heading", { name: "Process waste (A3)" })).toBeVisible();

  await page.getByRole("button", { name: /Next: Review/ }).click();
  await expect(page.getByText("Not calculated yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  await page.getByRole("region", { name: "Review" }).getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText(/Calculated .* Nothing has changed since\./)).toBeVisible();
  await expect(page.getByText("None under 1%")).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page).toHaveURL(/\/products$/);
  expect(seen.some((r) => r.path === "/submit")).toBe(true);
});

test("fits 390px without horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signIn(page, { 13: study(13, 3, "draft") });
  for (const [step, heading] of [
    ["materials", "Materials (A1)"],
    ["transport", "Inbound transport (A2)"],
    ["energy", "Plant energy (A3)"],
    ["review", "Review"],
  ]) {
    await page.goto(`/products/5/footprints/13/edit?step=${step}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    if (step === "transport") await page.getByRole("button", { name: "Add leg" }).first().click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, step).toBeLessThanOrEqual(0);
  }
});
