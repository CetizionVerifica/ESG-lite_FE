import { type Page, expect, test } from "@playwright/test";

/**
 * P21 Reference data smoke tests (VITE_NEW_UI=1 server). Admin endpoints answer
 * from in-memory lists; every write is recorded so the tests can check what
 * reached the server.
 */

type Country = { country_id: number; name: string; code: string; site_count: number };
type Cat = {
  category_id: number;
  category_name: string;
  scope: string | null;
  sites: { site_id: number; name: string }[];
  factor_count: number;
  config_count: number;
  unit_count: number;
  entry_count: number;
};

const SITES = [
  { site_id: 1, name: "Hidd", company: { company_id: 1, name: "Midal Cables" }, country: { country_id: 1 }, categories: [{ category_id: 1, category_name: "Fuel", scope: "Scope 1" }] },
  { site_id: 2, name: "Pune", company: { company_id: 2, name: "Gulf Foods" }, country: { country_id: 1 }, categories: [{ category_id: 1, category_name: "Fuel", scope: "Scope 1" }, { category_id: 2, category_name: "Electricity", scope: "Scope 2" }] },
];

async function signIn(page: Page) {
  let countries: Country[] = [
    { country_id: 1, name: "Bahrain", code: "BH", site_count: 2 },
    { country_id: 2, name: "Oman", code: "OM", site_count: 0 },
  ];
  let categories: Cat[] = [
    { category_id: 1, category_name: "Fuel", scope: "Scope 1", sites: [{ site_id: 1, name: "Hidd" }, { site_id: 2, name: "Pune" }], factor_count: 2, config_count: 2, unit_count: 1, entry_count: 9 },
    { category_id: 2, category_name: "Electricity", scope: "Scope 2", sites: [{ site_id: 2, name: "Pune" }], factor_count: 1, config_count: 0, unit_count: 0, entry_count: 0 },
  ];
  const units = [
    { unit_id: 1, unit_name: "litres", description: "Diesel", site: { site_id: 1, name: "Hidd" }, category: { category_id: 1, category_name: "Fuel" }, entry_count: 4 },
    { unit_id: 2, unit_name: "kWh", description: null, site: { site_id: 2, name: "Pune" }, category: { category_id: 2, category_name: "Electricity" }, entry_count: 0 },
  ];
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
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
      const path = new URL(request.url()).pathname;
      const method = request.method();
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      const body = (request.postDataJSON() ?? {}) as Record<string, never>;
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/sites")) return json(SITES);

      const country = /\/admin\/countries\/(\d+)$/.exec(path);
      if (country && method === "DELETE") {
        countries = countries.filter((c) => c.country_id !== Number(country[1]));
        return json({ message: "Country deleted successfully" });
      }
      if (path.endsWith("/admin/countries") && method === "POST") {
        countries = [...countries, { country_id: 3, name: body.name, code: body.code, site_count: 0 }];
        return json({ message: "Country created successfully" }, 201);
      }
      if (path.endsWith("/admin/countries")) return json(countries);

      const cat = /\/admin\/categories\/(\d+)$/.exec(path);
      if (cat && method === "PUT") {
        const ids = body.site_ids as unknown as number[];
        categories = categories.map((c) =>
          c.category_id === Number(cat[1]) ? { ...c, category_name: body.category_name, scope: body.scope, sites: SITES.filter((s) => ids.includes(s.site_id)) } : c,
        );
        return json({ message: "Category updated successfully" });
      }
      if (path.endsWith("/admin/categories") && method === "POST") {
        categories = [
          ...categories,
          { category_id: 10 + categories.length, category_name: body.category_name, scope: body.scope, sites: [], factor_count: 0, config_count: 0, unit_count: 0, entry_count: 0 },
        ];
        return json({ message: "Category created successfully" }, 201);
      }
      if (path.endsWith("/admin/categories")) return json(categories);

      const pair = /\/admin\/units\/site\/(\d+)\/category\/(\d+)$/.exec(path);
      if (pair) return json(units.filter((u) => u.site.site_id === Number(pair[1]) && u.category.category_id === Number(pair[2])));
      if (path.endsWith("/admin/units")) return json(units);
      return json({});
    },
  );
  return { calls };
}

test("countries: the old path lands on the tab, a used country can't be deleted, a new one is added", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/countries");
  await expect(page).toHaveURL(/\/setup\/reference\?tab=countries/);
  const table = page.getByRole("table", { name: "Countries" });
  await expect(table.getByRole("row", { name: /Bahrain/ })).toContainText("BH");
  await expect(table.getByRole("row", { name: /Bahrain/ })).toContainText("2");

  await page.getByRole("button", { name: "Edit Bahrain" }).click();
  await page.getByRole("dialog", { name: "Bahrain" }).getByRole("button", { name: "Delete country" }).click();
  const blocked = page.getByRole("dialog", { name: "Can't delete Bahrain" });
  await expect(blocked).toContainText("2 sites use Bahrain");
  await blocked.getByRole("button", { name: "OK" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add country" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add country" });
  await drawer.getByLabel("Country name").fill("India");
  await drawer.getByLabel("ISO code").fill("1n");
  await drawer.getByRole("button", { name: "Add country" }).click();
  await expect(drawer.getByText(/two-letter ISO code/)).toBeVisible();
  await drawer.getByLabel("ISO code").fill("in");
  await drawer.getByRole("button", { name: "Add country" }).click();
  await expect(page.getByText('Country "India" added')).toBeVisible();
  await expect(table.getByRole("row", { name: /India/ })).toContainText("IN");
  expect(calls).toEqual([{ method: "POST", path: expect.stringMatching(/\/admin\/countries$/), body: { name: "India", code: "IN" } }]);
});

test("categories: filter by scope, edit sites after creation, add another", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/setup/reference?tab=categories");
  const table = page.getByRole("table", { name: "Categories" });
  await expect(table.getByRole("row")).toHaveCount(3);

  await page.getByRole("button", { name: /Scope:/ }).click();
  await page.getByRole("checkbox", { name: "Scope 2" }).click();
  await expect(page.getByRole("checkbox", { name: "Scope 2" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByTestId("setup-summary")).toHaveText("1 category of 2");

  // Electricity: put it on Hidd too, switch it to Scope 1.
  await page.getByRole("button", { name: "Edit Electricity" }).click();
  const drawer = page.getByRole("dialog", { name: "Electricity" });
  await drawer.getByRole("checkbox", { name: "Hidd" }).check();
  await drawer.getByRole("radio", { name: /^Scope 1/ }).check();
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText('Category "Electricity" saved')).toBeVisible();
  expect(calls.at(-1)).toEqual({
    method: "PUT",
    path: expect.stringMatching(/\/admin\/categories\/2$/),
    body: { category_name: "Electricity", scope: "Scope 1", site_ids: [1, 2] },
  });

  // Fuel is in use, so delete only explains why not.
  await page.getByRole("button", { name: /Clear/ }).first().click();
  await page.getByRole("button", { name: "Edit Fuel" }).click();
  await page.getByRole("dialog", { name: "Fuel" }).getByRole("button", { name: "Delete category" }).click();
  await expect(page.getByRole("dialog", { name: "Can't delete Fuel" })).toContainText("9 entries");
  await page.getByRole("dialog", { name: "Can't delete Fuel" }).getByRole("button", { name: "OK" }).click();
  await page.keyboard.press("Escape");

  // Add two in a row; the drawer stays open after the first.
  await page.getByRole("button", { name: "Add category" }).first().click();
  let add = page.getByRole("dialog", { name: "Add category" });
  await add.getByLabel("Category name").fill("Solar generation");
  await add.getByRole("radio", { name: /None – counts as saving/ }).check();
  await add.getByRole("checkbox", { name: "Add another after this" }).check();
  await add.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText('Category "Solar generation" added')).toBeVisible();
  add = page.getByRole("dialog", { name: "Add category" });
  await expect(add.getByLabel("Category name")).toHaveValue("");
  await add.getByLabel("Category name").fill("Water");
  await add.getByRole("checkbox", { name: /Assign to all sites/ }).check();
  await add.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText('Category "Water" added')).toBeVisible();
  expect(calls.slice(-2).map((c) => c.body)).toEqual([
    { category_name: "Solar generation", scope: null, site_ids: [], assign_all_sites: false },
    { category_name: "Water", scope: "Scope 1", site_ids: [1, 2], assign_all_sites: true },
  ]);
});

test("units: site and category chips ask the server for that pair", async ({ page }) => {
  await signIn(page);
  await page.goto("/setup/reference?tab=units&site=2&category=2");
  const table = page.getByRole("table", { name: "Units" });
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("row", { name: /kWh/ })).toContainText("Pune");

  await page.goto("/setup/reference?tab=units");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row", { name: /litres/ })).toContainText("4");
  await page.getByRole("button", { name: "Edit litres" }).click();
  const drawer = page.getByRole("dialog", { name: "litres" });
  await expect(drawer.getByLabel("Category")).toHaveValue("1");
  await drawer.getByRole("button", { name: "Delete unit" }).click();
  await expect(page.getByRole("alertdialog", { name: /Delete unit "litres"/ })).toContainText("4 entries already using it keep their unit");
});
