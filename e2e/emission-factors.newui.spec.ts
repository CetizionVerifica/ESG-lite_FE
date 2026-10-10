import { type Page, expect, test } from "@playwright/test";

/**
 * P22 Emission factors smoke tests (VITE_NEW_UI=1 server). The admin and AI
 * endpoints answer from in-memory lists; every write and every list query is
 * recorded so the tests can check what reached the server.
 */

type Cat = { category_id: number; category_name: string; scope: string | null };
type FactorRec = {
  emission_factor_id: number;
  year: number;
  factor_value: string;
  denominator_unit: string | null;
  source: string | null;
  emission_category_name: string | null;
  upload_batch_id: string | null;
  site: { site_id: number; name: string };
  category: Cat;
};

const COMPANIES = [
  { company_id: 1, name: "Midal Cables" },
  { company_id: 2, name: "Gulf Foods" },
];
const CATEGORIES: Cat[] = [
  { category_id: 1, category_name: "Fuel", scope: "Scope 1" },
  { category_id: 2, category_name: "Refrigerants", scope: "Scope 1" },
  { category_id: 3, category_name: "Electricity", scope: "Scope 2" },
];
const SITES = [
  { site_id: 1, name: "Hidd", company: COMPANIES[0], categories: [CATEGORIES[0], CATEGORIES[2]] },
  { site_id: 2, name: "Pune", company: COMPANIES[1], categories: [CATEGORIES[1]] },
];
const BATCHES = [
  { upload_batch_id: "b-1", count: 1, uploaded_at: "2026-10-03T08:00:00Z", site_id: 1, site_name: "Hidd", category_id: 3, category_name: "Electricity" },
];
const UPLOADS = [
  { id: 9, file_name: "defra-2024.xlsx", cloudinary_url: "https://files.example.com/defra.xlsx", uploaded_by: 5, site_id: 1, layout_type: "sub_columns", total_records: 3, records_created: 1, records_skipped: 2, status: "completed", created_at: "2026-10-03T08:00:00Z" },
];

function makeFactors(): FactorRec[] {
  const f = (id: number, site: number, cat: number, year: number, value: string, name: string | null, batch: string | null = null): FactorRec => ({
    emission_factor_id: id,
    year,
    factor_value: value,
    denominator_unit: "litre",
    source: "DEFRA",
    emission_category_name: name,
    upload_batch_id: batch,
    site: { site_id: site, name: SITES.find((s) => s.site_id === site)!.name },
    category: CATEGORIES.find((c) => c.category_id === cat)!,
  });
  return [f(1, 1, 1, 2024, "2.6800", "Diesel"), f(2, 1, 3, 2024, "0.5100", "Grid", "b-1"), f(3, 2, 2, 2023, "1430.0000", "R-134a")];
}

async function signIn(page: Page) {
  let factors = makeFactors();
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const lists: URLSearchParams[] = [];
  const user = { name: "Sam Staff", email: "sam@example.com" };
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json(COMPANIES);
      if (path.endsWith("/admin/categories")) return json(CATEGORIES);
      if (path.endsWith("/admin/sites")) return json(SITES);
      if (path.endsWith("/admin/users")) return json([{ user_id: 5, name: "Sam", last_name: "Staff", email: "sam@example.com" }]);
      if (path.endsWith("/v1/emission-factors/uploads")) return json(UPLOADS);
      if (path.endsWith("/admin/emission-factors/batches")) return json(BATCHES);

      const one = /\/admin\/emission-factors\/(\d+)$/.exec(path);
      const body = request.postDataJSON() as Record<string, never> | null;
      if (one && method === "DELETE") {
        factors = factors.filter((f) => f.emission_factor_id !== Number(one[1]));
        return json({ message: "Emission factor deleted successfully" });
      }
      if (one && method === "PUT") {
        factors = factors.map((f) => (f.emission_factor_id === Number(one[1]) ? { ...f, factor_value: String(body!.factor_value) } : f));
        return json({ message: "Emission factor updated successfully" });
      }
      if (path.endsWith("/admin/emission-factors") && method === "POST") {
        const site = SITES.find((s) => s.site_id === body!.site_id)!;
        factors = [
          {
            emission_factor_id: 4,
            year: body!.year,
            factor_value: String(body!.factor_value),
            denominator_unit: body!.denominator_unit ?? null,
            source: body!.source ?? null,
            emission_category_name: body!.emission_category_name ?? null,
            upload_batch_id: null,
            site: { site_id: site.site_id, name: site.name },
            category: CATEGORIES.find((c) => c.category_id === body!.category_id)!,
          },
          ...factors,
        ];
        return json({ message: "Emission factor created successfully" }, 201);
      }
      if (path.endsWith("/admin/emission-factors")) {
        const q = url.searchParams;
        lists.push(q);
        const company = Number(q.get("company_id")) || null;
        const year = Number(q.get("year")) || null;
        const site = Number(q.get("site_id")) || null;
        const rows = factors.filter(
          (f) =>
            (!company || SITES.find((s) => s.site_id === f.site.site_id)!.company.company_id === company) &&
            (!site || f.site.site_id === site) &&
            (!year || f.year === year),
        );
        return json({ data: rows, total: rows.length, page: 1, limit: 50, totalPages: 1 });
      }
      return json({});
    },
  );
  return { calls, lists };
}

const factorsTable = (page: Page) => page.getByRole("table", { name: "Emission factors" });

async function chooseFilter(page: Page, label: string, option: string) {
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click();
  await page.getByRole("radio", { name: option }).click();
}

test("a superadmin filters factors by client and year, and adds one", async ({ page }) => {
  const { calls, lists } = await signIn(page);
  // The old path still lands here.
  await page.goto("/emission-factors");
  await expect(page).toHaveURL(/\/factors/);
  const table = factorsTable(page);
  await expect(table.getByRole("row")).toHaveCount(4);
  const grid = table.getByRole("row", { name: /Grid/ });
  await expect(grid).toContainText("0.51");
  await expect(grid).toContainText("Import · 3 Oct 2026");
  await expect(table.getByRole("row", { name: /Diesel/ })).toContainText("Added by hand");

  await chooseFilter(page, "Client", "Midal Cables");
  await expect(page).toHaveURL(/client=1/);
  await expect(table.getByRole("row")).toHaveCount(3);
  await chooseFilter(page, "Year", "2024");
  await expect(page).toHaveURL(/year=2024/);
  await expect(page.getByTestId("setup-summary")).toHaveText("2 factors");
  await expect.poll(() => lists.at(-1)?.toString()).toContain("year=2024");
  expect(lists.at(-1)?.get("company_id")).toBe("1");

  // Site options follow the client; category options follow the site.
  await page.getByRole("button", { name: /^Site:/ }).click();
  await expect(page.getByRole("radio", { name: "Pune" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Hidd" }).click();
  await page.getByRole("button", { name: /^Category:/ }).click();
  await expect(page.getByRole("radio", { name: "Refrigerants" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => lists.at(-1)?.get("site_id")).toBe("1");
  expect(lists.at(-1)?.get("company_id")).toBeNull();

  // Add factor starts from the filters; the site's categories only.
  await page.getByRole("button", { name: "Add factor" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add factor" });
  await drawer.getByRole("button", { name: "Add factor" }).click();
  await expect(drawer.getByText("Choose a category.")).toBeVisible();
  await expect(drawer.getByText("Enter the factor.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await expect(drawer.getByText("Entries for 2025 use 2024 factors.")).toBeVisible();
  await drawer.getByRole("combobox", { name: "Category" }).selectOption({ label: "Fuel" });
  await drawer.getByLabel("Emission category name").fill("Petrol");
  await drawer.getByRole("textbox", { name: "Factor", exact: true }).fill("2.31");
  await drawer.getByLabel("Unit").fill("litre");
  await drawer.getByRole("button", { name: "Add factor" }).click();

  await expect(page.getByText("Factor added")).toBeVisible();
  expect(calls).toEqual([
    {
      method: "POST",
      path: expect.stringMatching(/\/admin\/emission-factors$/),
      body: { site_id: 1, category_id: 1, year: 2024, factor_value: 2.31, denominator_unit: "litre", emission_category_name: "Petrol" },
    },
  ]);
  await expect(table.getByRole("row", { name: /Petrol/ })).toContainText("2.31");
});

test("a superadmin edits a factor, deletes it after confirming, and sees imports", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/factors");
  await page.getByRole("button", { name: "Edit Hidd, Fuel, 2024" }).click();
  const drawer = page.getByRole("dialog", { name: "Edit factor" });
  await expect(drawer.getByRole("button", { name: "Save" })).toBeDisabled();
  await drawer.getByRole("textbox", { name: "Factor", exact: true }).fill("2.7");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Factor saved")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PUT", path: expect.stringMatching(/\/admin\/emission-factors\/1$/), body: { factor_value: 2.7 } });

  await factorsTable(page).getByRole("row", { name: /Diesel/ }).click();
  await page.getByRole("dialog", { name: "Edit factor" }).getByRole("button", { name: "Delete factor" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this factor?" });
  await expect(confirm).toContainText("Hidd · Fuel (Diesel) · 2024: 2.7 per litre");
  await confirm.getByRole("button", { name: "Delete factor" }).click();
  await expect(page.getByText("Factor deleted")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringMatching(/\/admin\/emission-factors\/1$/) });
  await expect(factorsTable(page).getByRole("row")).toHaveCount(3);

  await page.getByRole("tab", { name: /Imports/ }).click();
  await expect(page).toHaveURL(/tab=imports/);
  await expect(page.getByRole("table", { name: "Imported factor batches" }).getByRole("row", { name: /Electricity/ })).toContainText("Hidd");
  const sheet = page.getByRole("table", { name: "Uploaded sheets" }).getByRole("row", { name: /defra-2024/ });
  await expect(sheet).toContainText("Sam Staff");
  await expect(sheet).toContainText("Sub-columns");
  await expect(sheet).toContainText("Saved");
  await page.getByRole("button", { name: "Delete import batch for Hidd, Electricity" }).click();
  const batchConfirm = page.getByRole("alertdialog", { name: "Delete 1 imported factor?" });
  await batchConfirm.getByRole("button", { name: "Delete batch" }).click();
  await expect(page.getByText("1 imported factor deleted")).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringMatching(/\/admin\/emission-factors\/batch\/b-1$/) });
});
