import { type Page, expect, test } from "@playwright/test";

/**
 * P23 Category mappings smoke tests (VITE_NEW_UI=1 server). The admin
 * endpoints answer from in-memory lists, and every write is recorded so the
 * tests can check what reached the server.
 */

const COMPANIES = [
  { company_id: 1, name: "Midal Cables" },
  { company_id: 2, name: "Gulf Foods" },
];
const SITES = [
  { site_id: 1, name: "Hidd", company: COMPANIES[0] },
  { site_id: 2, name: "Sitra", company: COMPANIES[0] },
  { site_id: 3, name: "Pune", company: COMPANIES[1] },
];
const CATEGORIES = [
  { category_id: 1, category_name: "Fuel" },
  { category_id: 2, category_name: "Electricity" },
];
const FACTORS: Record<number, unknown[]> = {
  1: [
    { emission_factor_id: 1, emission_category_name: "Diesel", site: { site_id: 1 }, year: 2025, factor_value: "2.6800", denominator_unit: "litre" },
    { emission_factor_id: 2, emission_category_name: "Petrol", site: { site_id: 3 }, year: 2025, factor_value: "2.3100", denominator_unit: "litre" },
    { emission_factor_id: 3, emission_category_name: "LPG", site: { site_id: 2 }, year: 2024, factor_value: "1.5500", denominator_unit: "kg" },
  ],
  2: [{ emission_factor_id: 4, emission_category_name: "Grid", site: { site_id: 3 }, year: 2025, factor_value: "0.6000", denominator_unit: "kWh" }],
};

type M = { id: number; company_id: number; company_name: string; site_id: number | null; category_id: number; company_category_name: string; global_category_name: string };

function makeMappings(): M[] {
  return [
    { id: 1, company_id: 1, company_name: "Midal Cables", site_id: null, category_id: 1, company_category_name: "HSD fuel", global_category_name: "Diesel" },
    { id: 2, company_id: 1, company_name: "Midal Cables", site_id: 1, category_id: 1, company_category_name: "Mogas", global_category_name: "Petrol" },
    { id: 3, company_id: 2, company_name: "Gulf Foods", site_id: null, category_id: 2, company_category_name: "EWA power", global_category_name: "Grid" },
  ];
}

async function signIn(page: Page) {
  let mappings = makeMappings();
  let nextId = 10;
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const me = { user_id: 5, name: "Sam", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(me));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const isMultipart = (request.headers()["content-type"] ?? "").includes("multipart");
      const body = method === "GET" || isMultipart ? null : (request.postDataJSON() as Record<string, unknown> | null);
      if (method !== "GET") calls.push({ method, path, body });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user: me });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json(COMPANIES);
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/categories")) return json(CATEGORIES);
      const factors = /\/admin\/emission-factors\/category\/(\d+)$/.exec(path);
      if (factors) return json(FACTORS[Number(factors[1])] ?? []);

      if (path.endsWith("/v1/category-mappings/parse-excel")) {
        return json({
          filename: "mappings.xlsx",
          total_records: 3,
          warnings: ["Row 5 was empty and skipped."],
          mappings: [
            { company_category_name: "HSD fuel", global_category_name: "Diesel" },
            { company_category_name: "Bottled gas", global_category_name: "LPG" },
            { company_category_name: "Bunker oil", global_category_name: "Heavy fuel oil", factor_value: 3.1, unit: "litre" },
          ],
        });
      }
      if (path.endsWith("/admin/category-mappings/bulk") && method === "POST") {
        const rows = (body!.mappings as M[]).map((r) => ({ ...r, id: nextId++ }));
        mappings = [...mappings, ...rows];
        return json({ message: "done", created: rows.length, skipped: 0, errors: [] }, 201);
      }
      if (path.endsWith("/admin/category-mappings/bulk") && method === "DELETE") {
        const ids = body!.ids as number[];
        mappings = mappings.filter((m) => !ids.includes(m.id));
        return json({ deleted: ids.length });
      }
      const one = /\/admin\/category-mappings\/(\d+)$/.exec(path);
      if (one && method === "PUT") {
        mappings = mappings.map((m) => (m.id === Number(one[1]) ? { ...m, ...(body as object) } : m));
        return json({ message: "Mapping updated successfully" });
      }
      if (one && method === "DELETE") {
        mappings = mappings.filter((m) => m.id !== Number(one[1]));
        return json({ message: "Mapping deleted successfully" });
      }
      if (path.endsWith("/admin/category-mappings") && method === "POST") {
        const created = { ...(body as unknown as M), id: nextId++ };
        mappings = [...mappings, created];
        return json({ message: "Mapping created successfully", mapping: created }, 201);
      }
      if (path.endsWith("/admin/category-mappings")) return json(mappings);
      return json({});
    },
  );
  return { calls };
}

const table = (page: Page) => page.getByRole("table", { name: "Category mappings" });

test("a superadmin sees which mappings have a factor and adds one by hand", async ({ page }) => {
  const { calls } = await signIn(page);
  // The old address lands on the new page.
  await page.goto("/category-mappings");
  await expect(page).toHaveURL(/\/factors\/mappings/);
  const rows = table(page).getByRole("row");
  await expect(rows).toHaveCount(4);

  const hsd = table(page).getByRole("row", { name: /HSD fuel/ });
  await expect(hsd).toContainText("Matched");
  await expect(hsd).toContainText("All sites");
  // Petrol exists only at another client's site, so Midal's site mapping has no factor.
  const mogas = table(page).getByRole("row", { name: /Mogas/ });
  await expect(mogas).toContainText("No factor");
  await expect(mogas.getByRole("link", { name: "Create factor" })).toHaveAttribute("href", "/factors?client=1&category=1&q=Petrol&site=1");
  await expect(page.getByTestId("missing-note")).toContainText("1 mapping has no factor for their client");

  await page.getByRole("button", { name: "Show them" }).click();
  await expect(page).toHaveURL(/match=missing/);
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: /Clear all/ }).click();
  await expect(rows).toHaveCount(4);

  // Add mapping: a duplicate is refused before anything is sent.
  await page.getByRole("button", { name: "Add mapping" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add mapping" });
  const client = drawer.getByRole("combobox", { name: "Client" });
  await client.click();
  await client.fill("Mid");
  await page.getByRole("option", { name: "Midal Cables" }).click();
  await drawer.getByLabel("Category").selectOption({ label: "Fuel" });
  await drawer.getByLabel("Client's name").fill("hsd FUEL");
  const global = drawer.getByRole("combobox", { name: "Global factor name" });
  await global.click();
  // Only names with a factor at Midal's sites are offered.
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText(["Diesel", "LPG"]);
  await page.getByRole("option", { name: "LPG" }).click();
  await expect(drawer.getByTestId("factor-preview")).toHaveText("Factor: 1.55 kgCO₂e / kg · 2024");
  await drawer.getByRole("button", { name: "Add mapping" }).click();
  await expect(drawer.getByText(/already maps “hsd FUEL”/)).toBeVisible();
  expect(calls).toHaveLength(0);

  await drawer.getByLabel("Client's name").fill("Bottled gas");
  await drawer.getByRole("button", { name: "Add mapping" }).click();
  await expect(page.getByText("“Bottled gas” mapped")).toBeVisible();
  expect(calls).toEqual([
    {
      method: "POST",
      path: expect.stringMatching(/\/admin\/category-mappings$/),
      body: { company_id: 1, company_name: "Midal Cables", site_id: null, category_id: 1, company_category_name: "Bottled gas", global_category_name: "LPG", created_by: 5 },
    },
  ]);
  await expect(rows).toHaveCount(5);

  // Edit sends only what changed.
  await table(page).getByRole("row", { name: /Mogas/ }).click();
  await expect(page).toHaveURL(/open=2/);
  const edit = page.getByRole("dialog", { name: "Mogas → Petrol" });
  await expect(edit.getByRole("combobox", { name: "Client" })).toBeDisabled();
  await edit.getByLabel("Site").selectOption({ label: "All sites" });
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("“Mogas” saved")).toBeVisible();
  expect(calls[1]).toEqual({ method: "PUT", path: expect.stringMatching(/\/admin\/category-mappings\/2$/), body: { site_id: null } });
});

test("a superadmin imports a sheet and deletes mappings in bulk", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/factors/mappings?client=1");
  await expect(table(page).getByRole("row")).toHaveCount(3);

  await page.getByRole("button", { name: "Import sheet" }).click();
  const drawer = page.getByRole("dialog", { name: "Import mapping sheet" });
  // The client comes from the filter; category and file are still needed.
  await drawer.getByRole("button", { name: "Read sheet" }).click();
  await expect(drawer.getByText("Choose the category.")).toBeVisible();
  await drawer.getByLabel("Category").selectOption({ label: "Fuel" });
  await drawer.locator('input[type="file"]').setInputFiles({ name: "mappings.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("PK") });
  await drawer.getByRole("button", { name: "Read sheet" }).click();

  await expect(drawer.getByTestId("import-summary")).toHaveText("1 of 2 match existing factors · 1 only at some sites · 1 can't be added");
  await expect(drawer.getByText("Row 5 was empty and skipped.")).toBeVisible();
  const sheet = drawer.getByRole("table", { name: "Rows read from the sheet" });
  await expect(sheet.getByRole("row").nth(1)).toContainText("Already mapped");
  await expect(sheet.getByRole("row").nth(3)).toContainText("No factor");
  // Fix the third row's name inline: it now matches.
  await drawer.getByLabel("Global factor name, row 3").fill("Diesel");
  await expect(drawer.getByTestId("import-summary")).toHaveText("2 of 2 match existing factors · 2 only at some sites · 1 can't be added");
  await expect(drawer.getByTestId("import-target")).toHaveText(/Adding to Midal Cables · .+ · All sites/);
  await drawer.getByRole("button", { name: "Add 2 mappings" }).click();

  await expect(drawer.getByTestId("import-result")).toContainText("2 mappings added");
  expect(calls.map((c) => c.method + " " + c.path.replace(/^.*\/(v1|admin)/, "/$1"))).toEqual(["POST /v1/category-mappings/parse-excel", "POST /admin/category-mappings/bulk"]);
  expect((calls[1].body as { mappings: unknown[] }).mappings).toEqual([
    { company_id: 1, company_name: "Midal Cables", site_id: null, category_id: 1, company_category_name: "Bottled gas", global_category_name: "LPG", created_by: 5 },
    { company_id: 1, company_name: "Midal Cables", site_id: null, category_id: 1, company_category_name: "Bunker oil", global_category_name: "Diesel", created_by: 5 },
  ]);
  await drawer.getByRole("button", { name: "Done" }).click();
  await expect(table(page).getByRole("row")).toHaveCount(5);

  // Bulk delete two rows.
  await page.getByRole("checkbox", { name: /Select Bottled gas/ }).check();
  await page.getByRole("checkbox", { name: /Select Bunker oil/ }).check();
  await page.getByRole("button", { name: "Delete 2 mappings…" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete 2 mappings for Midal Cables?" });
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("2 mappings deleted")).toBeVisible();
  expect(calls[2]).toEqual({ method: "DELETE", path: expect.stringMatching(/\/admin\/category-mappings\/bulk$/), body: { ids: [10, 11] } });
  await expect(table(page).getByRole("row")).toHaveCount(3);
});
