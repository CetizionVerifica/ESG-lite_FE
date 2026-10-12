import { type Page, expect, test } from "@playwright/test";

/**
 * C04 Material factors smoke tests. /pcf/material-factors
 * answers from an in-memory list and every write is recorded.
 */

type Factor = Record<string, unknown> & { material_factor_id: number; name: string };

const base = {
  geography: null,
  gwp_set: "AR6",
  source: null,
  source_year: null,
  dataset_ref: null,
  licence: "open",
  recycled_variant: false,
  valid_from: null,
  valid_to: null,
  value_hidden: false,
  used_by: 0,
  used_by_approved: 0,
};

function makeFactors(role: "Superadmin" | "Manager"): Factor[] {
  return [
    { ...base, material_factor_id: 1, company_id: null, name: "Primary aluminium ingot", material_group: "aluminium", geography: "GCC", unit: "kg", value_kgco2e: 8.6, source: "IAI", source_year: 2023 },
    {
      ...base,
      material_factor_id: 2,
      company_id: null,
      name: "Copper cathode",
      material_group: "copper",
      unit: "kg",
      licence: "ecoinvent",
      source: "ecoinvent 3.10",
      value_kgco2e: role === "Superadmin" ? 4.2 : null,
      value_hidden: role !== "Superadmin",
    },
    { ...base, material_factor_id: 3, company_id: 1, name: "Supplier PVC compound", material_group: "polymer", unit: "kg", value_kgco2e: 2.1, licence: "supplier", used_by: 2, used_by_approved: 1 },
  ];
}

const USES = [
  { pcf_study_id: 11, product: { product_id: 5, name: "EC-grade wire rod 9.5 mm" }, version: 2, status: "approved", site_id: 1 },
  { pcf_study_id: 12, product: { product_id: 5, name: "EC-grade wire rod 9.5 mm" }, version: 3, status: "draft", site_id: 1 },
];

async function signIn(page: Page, role: "Superadmin" | "Manager") {
  let factors = makeFactors(role);
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const user = { name: "Sam Staff", email: "sam@example.com" };
  await page.addInitScript(
    ([u, r]) => {
      localStorage.setItem("token", "test-token");
      localStorage.setItem("role", r);
      localStorage.setItem("user", u);
    },
    [JSON.stringify(user), role],
  );
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      // The AI sheet reader (E2). Uploads are multipart, so answer before the JSON body is read.
      if (path.endsWith("/v1/pcf/material-factors/parse-excel")) {
        calls.push({ method, path, body: null });
        const data = request.postData() ?? "";
        if (data.includes("Raced row")) return json({ detail: "AI service down" }, 503);
        const personMapping = /name="mapping"\r?\n\r?\n(\{[^\r\n]*\})/.exec(data)?.[1];
        const mapping = personMapping ? (JSON.parse(personMapping) as Record<string, string | null>) : null;
        const header = (field: string, def: string | null) => (mapping ? mapping[field] : def);
        const col = (field: string, def: string | null, by: "header" | "ai" = "header", confidence = 95) => {
          const h = header(field, def);
          return h ? { [field]: { header: h, confidence, reason: by === "ai" ? "Values look like factors" : `Header “${h}” is the ${field} column`, by } } : {};
        };
        const valueCol = header("value_kgco2e", "kgCO2e");
        const rows = valueCol
          ? [
              { line: 2, values: { name: "Wooden drum", material_group: "packaging", unit: "unit", value_kgco2e: 38.5, geography: null, source: "DEFRA", source_year: 2024 }, confidence: 95, reason: "Row 2", warnings: [], problems: [] },
              { line: 3, values: { name: "Steel wire", material_group: "steel", unit: "kg", value_kgco2e: 2.3, geography: "GLO", source: "worldsteel", source_year: 2022 }, confidence: 95, reason: "Row 3", warnings: [], problems: [] },
            ]
          : [
              { line: 2, values: { name: "Wooden drum", material_group: "packaging", unit: "unit", value_kgco2e: null }, confidence: 40, reason: "No value column", warnings: [], problems: ["Value must be a number of 0 or more"] },
              { line: 3, values: { name: "Steel wire", material_group: "steel", unit: "kg", value_kgco2e: null }, confidence: 40, reason: "No value column", warnings: [], problems: ["Value must be a number of 0 or more"] },
            ];
        return json({
          file_name: "factors.csv",
          sheet_names: [],
          sheet_name: null,
          header_line: 1,
          headers: ["Material", "Group", "Unit", "kgCO2e", "Region", "Source", "Year"],
          mapping: { ...col("name", "Material"), ...col("material_group", "Group"), ...col("unit", "Unit"), ...col("value_kgco2e", "kgCO2e", "ai", 72), ...col("geography", "Region"), ...col("source", "Source"), ...col("source_year", "Year") },
          sheet_unit: null,
          rows,
          total_rows: 2,
          rows_with_problems: valueCol ? 0 : 2,
          low_confidence_rows: valueCol ? 0 : 2,
          warnings: [],
          ai_used: true,
        });
      }
      const body = method === "GET" || method === "DELETE" ? null : (request.postDataJSON() as Record<string, unknown>);
      // The import dry run is a check, not a write.
      if (url.searchParams.get("dry_run") === "1") {
        const rows = body!.rows as Record<string, unknown>[];
        const errors = rows.flatMap((r, index) => {
          const dup = factors.find((f) => f.name.toLowerCase() === String(r.name).toLowerCase());
          return dup ? [{ index, message: "A factor with this name, geography and year already exists", existing_id: dup.material_factor_id }] : [];
        });
        return json({ valid: errors.length === 0, rows: rows.length, errors });
      }
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role, user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json([{ company_id: 1, name: "Midal Cables" }]);

      if (path.endsWith("/pcf/material-factors/import")) {
        const rows = body!.rows as Record<string, unknown>[];
        // Added by someone else between the dry run and the import.
        const raced = rows.findIndex((r) => r.name === "Raced row");
        if (raced >= 0) return json({ message: "Some rows already exist", errors: [{ index: raced, message: "A factor with this name, geography and year already exists", existing_id: 1 }] }, 409);
        const made = rows.map((r, i) => ({ ...base, ...r, material_factor_id: 100 + i, company_id: body!.company_id ?? 1 }) as Factor);
        factors = [...factors, ...made];
        return json({ created: made.length, factors: made }, 201);
      }
      const one = /\/pcf\/material-factors\/(\d+)$/.exec(path);
      if (one && method === "GET") {
        const f = factors.find((x) => x.material_factor_id === Number(one[1]));
        return f ? json({ ...f, used_in: f.material_factor_id === 3 ? USES : [] }) : json({ message: "Factor not found" }, 404);
      }
      if (one && method === "PATCH") {
        factors = factors.map((f) => (f.material_factor_id === Number(one[1]) ? { ...f, ...body } : f));
        return json(factors.find((f) => f.material_factor_id === Number(one[1])));
      }
      if (path.endsWith("/pcf/material-factors") && method === "POST") {
        const dup = factors.find((f) => f.name.toLowerCase() === String(body!.name).toLowerCase() && (f.geography ?? null) === (body!.geography ?? null));
        if (dup) return json({ message: "A factor with this name, geography and year already exists", existing_id: dup.material_factor_id }, 409);
        const made = { ...base, ...body, material_factor_id: 50, company_id: body!.company_id ?? 1 } as Factor;
        factors = [...factors, made];
        return json(made, 201);
      }
      if (path.endsWith("/pcf/material-factors")) return json(factors);
      return json({});
    },
  );
  return { calls };
}

const table = (page: Page) => page.getByRole("table", { name: "Material factors" });

test("a superadmin filters, hits a duplicate, and imports a sheet", async ({ page }) => {
  const { calls } = await signIn(page, "Superadmin");
  await page.goto("/factors/materials");
  await expect(table(page).getByRole("row")).toHaveCount(4);
  // Superadmins see licensed values.
  await expect(table(page).getByRole("row", { name: /Copper cathode/ })).toContainText("4.2");
  await expect(table(page).getByRole("row", { name: /Supplier PVC/ })).toContainText("Midal Cables");

  await page.getByRole("button", { name: /Group:/ }).click();
  await page.getByRole("checkbox", { name: "Copper" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/group=copper/);
  await expect(page.getByTestId("factor-summary")).toHaveText("1 factor of 3");
  await page.getByRole("button", { name: /Clear all/ }).click();

  // Required fields are checked before anything is sent.
  await page.getByRole("button", { name: "Add factor" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add factor" });
  await drawer.getByLabel("Name").fill("primary aluminium ingot");
  await drawer.getByRole("button", { name: "Add factor" }).click();
  await expect(drawer.getByText("Pick a group.")).toBeVisible();
  expect(calls).toHaveLength(0);

  // A duplicate links to the existing row.
  await drawer.getByLabel("Group").selectOption("aluminium");
  await drawer.getByLabel("Geography").fill("GCC");
  await drawer.getByLabel("Value").fill("8.5");
  await drawer.getByRole("button", { name: "Add factor" }).click();
  await expect(drawer.getByText("This factor is already in the library")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "POST", body: { company_id: null, name: "primary aluminium ingot", geography: "GCC", value_kgco2e: 8.5 } });
  await drawer.getByRole("button", { name: "Open the existing factor" }).click();
  await expect(page).toHaveURL(/open=1/);
  await expect(page.getByRole("dialog", { name: "Primary aluminium ingot" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Import: headers are matched by name, rows checked, then sent in one request.
  await page.getByRole("button", { name: "Import sheet" }).click();
  const imp = page.getByRole("dialog", { name: "Import sheet" });
  const csv = ["Material,Group,Unit,kgCO2e,Region,Source,Year", "Wooden drum,packaging,unit,38.5,,DEFRA,2024", "Steel wire,steel,kg,2.3,GLO,worldsteel,2022", ","].join("\n");
  await imp.locator('input[type="file"]').setInputFiles({ name: "factors.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(imp.getByLabel("Name")).toHaveValue("Material");
  // The AI reader placed the value column and says so.
  await expect(imp.getByText("AI 72%")).toBeVisible();
  await expect(imp.getByText("All 2 rows are ready to import.")).toBeVisible();
  // A changed column re-reads the sheet with the person's mapping.
  await imp.getByLabel("Value (kgCO₂e per unit)").selectOption("");
  await expect(imp.getByText("Pick a column for Value (kgCO₂e per unit).")).toBeVisible();
  await imp.getByLabel("Value (kgCO₂e per unit)").selectOption("kgCO2e");
  await expect(imp.getByText("All 2 rows are ready to import.")).toBeVisible();
  expect(calls.filter((c) => c.path.endsWith("/parse-excel"))).toHaveLength(3);
  await imp.getByRole("button", { name: "Import 2 factors" }).click();
  await expect(imp.getByText("Imported 2 factors.", { exact: false })).toBeVisible();
  expect(calls.at(-1)).toMatchObject({
    method: "POST",
    path: expect.stringMatching(/\/import$/),
    body: {
      company_id: null,
      rows: [
        { name: "Wooden drum", material_group: "packaging", unit: "unit", value_kgco2e: 38.5, geography: null, source: "DEFRA", source_year: 2024 },
        { name: "Steel wire", material_group: "steel", unit: "kg", value_kgco2e: 2.3, geography: "GLO", source: "worldsteel", source_year: 2022 },
      ],
    },
  });
  await imp.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(table(page).getByRole("row")).toHaveCount(6);
});

test("a manager sees licensed values masked and edits their own factor", async ({ page }) => {
  const { calls } = await signIn(page, "Manager");
  await page.goto("/factors/materials");
  const copper = table(page).getByRole("row", { name: /Copper cathode/ });
  await expect(copper).toContainText("Licensed");
  await expect(copper).toContainText("ecoinvent 3.10");

  await copper.click();
  const locked = page.getByRole("dialog", { name: "Copper cathode" });
  await expect(locked.getByText("This factor is in the global library. Only a superadmin can change it.")).toBeVisible();
  await expect(locked.getByRole("button", { name: "Save" })).toHaveCount(0);
  await locked.getByRole("button", { name: "Close", exact: true }).last().click();

  await table(page).getByRole("row", { name: /Supplier PVC/ }).click();
  const own = page.getByRole("dialog", { name: "Supplier PVC compound" });
  await expect(own.getByText("Used by 1 approved footprint. They keep the old value until recalculated.")).toBeVisible();
  await expect(own.getByRole("listitem")).toHaveCount(2);
  await expect(own.getByRole("button", { name: "Delete factor" })).toBeDisabled();
  await own.getByLabel("Value").fill("2.3");
  await own.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText('Factor "Supplier PVC compound" saved')).toBeVisible();
  expect(calls).toEqual([{ method: "PATCH", path: expect.stringMatching(/\/pcf\/material-factors\/3$/), body: { value_kgco2e: 2.3 } }]);
});

test("an import refused after the check keeps Import off until the sheet changes", async ({ page }) => {
  const { calls } = await signIn(page, "Manager");
  await page.goto("/factors/materials");
  await page.getByRole("button", { name: "Import sheet" }).click();
  const imp = page.getByRole("dialog", { name: "Import sheet" });
  const csv = ["Material,Group,Unit,kgCO2e", "Raced row,steel,kg,2"].join("\n");
  await imp.locator('input[type="file"]').setInputFiles({ name: "factors.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  // The AI reader is down for this file: the sheet is read in the browser and the drawer says so.
  await expect(imp.getByText("The AI sheet reader couldn't be reached, so the columns were matched by header name here instead.")).toBeVisible();
  await expect(imp.getByLabel("Name")).toHaveValue("Material");
  await expect(imp.getByText("All 1 rows are ready to import.")).toBeVisible();
  await imp.getByRole("button", { name: "Import 1 factor" }).click();
  await expect(imp.getByText("Nothing was imported. Fix the rows below in the sheet or the columns, then import again.")).toBeVisible();
  await expect(imp.getByRole("button", { name: "Open existing" })).toBeVisible();
  await expect(imp.getByRole("button", { name: "Import 1 factor" })).toBeDisabled();
  expect(calls.filter((c) => c.path.endsWith("/import"))).toHaveLength(1);
});
