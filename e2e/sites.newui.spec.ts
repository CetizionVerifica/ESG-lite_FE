import { type Page, expect, test } from "@playwright/test";

/**
 * P19 Sites smoke tests (VITE_NEW_UI=1 server). The admin endpoints answer
 * from in-memory lists, and every write is recorded so the tests can check
 * what reached the server.
 */

type Cat = { category_id: number; category_name: string; scope: string | null };
type SiteRec = {
  site_id: number;
  name: string;
  address: string;
  contact_person: string;
  company: { company_id: number; name: string };
  country: { country_id: number; name: string };
  categories: Cat[];
};

const COMPANIES = [
  { company_id: 1, name: "Midal Cables" },
  { company_id: 2, name: "Gulf Foods" },
];
const COUNTRIES = [
  { country_id: 1, name: "Bahrain", code: "BH" },
  { country_id: 2, name: "India", code: "IN" },
];
const CATEGORIES: Cat[] = [
  { category_id: 1, category_name: "Fuel", scope: "Scope 1" },
  { category_id: 2, category_name: "Refrigerants", scope: "Scope 1" },
  { category_id: 3, category_name: "Electricity", scope: "Scope 2" },
  { category_id: 4, category_name: "Business travel", scope: "Scope 3" },
];

function makeSites(): SiteRec[] {
  return [
    {
      site_id: 1,
      name: "Hidd",
      address: "Hidd Industrial Area",
      contact_person: "Omar",
      company: COMPANIES[0],
      country: COUNTRIES[0],
      categories: [CATEGORIES[0], CATEGORIES[1], CATEGORIES[2]],
    },
    {
      site_id: 2,
      name: "Pune",
      address: "MIDC Road",
      contact_person: "Asha",
      company: COMPANIES[1],
      country: COUNTRIES[1],
      categories: [CATEGORIES[3]],
    },
  ];
}

const USERS = [
  { user_id: 4, name: "Omar", last_name: "Saleh", email: "omar@example.com", role: "User", site: { site_id: 1 }, sites: [] },
  { user_id: 5, name: "Mia", last_name: "Manager", email: "mia@example.com", role: "Manager", site: null, sites: [{ site_id: 1 }, { site_id: 2 }] },
];
const CONFIGS = [
  { pk_id: 1, config_name: "Hidd fuel", site: { site_id: 1 }, category: { category_id: 1 } },
  { pk_id: 2, config_name: "Hidd power", site: { site_id: 1 }, category: { category_id: 3 } },
];

async function signIn(page: Page) {
  let sites = makeSites();
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
      if (method !== "GET") calls.push({ method, path, body: request.postDataJSON() });

      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return json(COMPANIES);
      if (path.endsWith("/admin/countries")) return json(COUNTRIES);
      if (path.endsWith("/admin/categories")) return json(CATEGORIES);
      if (path.endsWith("/admin/users")) return json(USERS);
      if (path.endsWith("/admin/column-configs")) return json(CONFIGS);

      const one = /\/admin\/sites\/(\d+)$/.exec(path);
      const body = request.postDataJSON() as Record<string, never> | null;
      const fill = (b: Record<string, never>, id: number): SiteRec => ({
        site_id: id,
        name: b.name,
        address: b.address,
        contact_person: b.contact_person,
        company: COMPANIES.find((c) => c.company_id === b.company_id)!,
        country: COUNTRIES.find((c) => c.country_id === b.country_id)!,
        categories: CATEGORIES.filter((c) => (b.category_ids as number[]).includes(c.category_id)),
      });
      if (one && method === "PUT") {
        sites = sites.map((s) => (s.site_id === Number(one[1]) ? fill(body!, s.site_id) : s));
        return json({ message: "Site updated successfully" });
      }
      if (one && method === "DELETE") {
        sites = sites.filter((s) => s.site_id !== Number(one[1]));
        return json({ message: "Site deleted successfully" });
      }
      if (path.endsWith("/admin/sites") && method === "POST") {
        const site = fill(body!, 3);
        sites = [...sites, site];
        return json({ message: "Site created successfully", site }, 201);
      }
      if (path.endsWith("/admin/sites")) return json(sites);
      return json({});
    },
  );
  return { calls };
}

const sitesTable = (page: Page) => page.getByRole("table", { name: "Sites" });

async function pick(page: Page, label: string, option: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.click();
  await box.fill(option.slice(0, 3));
  await page.getByRole("option", { name: option }).click();
}

test("a superadmin filters sites and adds one with categories", async ({ page }) => {
  const { calls } = await signIn(page);
  // The old path still lands here.
  await page.goto("/sites");
  await expect(page).toHaveURL(/\/setup\/sites/);
  const table = sitesTable(page);
  await expect(table.getByRole("row")).toHaveCount(3);
  const hidd = table.getByRole("row", { name: /Hidd/ });
  await expect(hidd).toContainText("Midal Cables");
  await expect(hidd.getByText("Scope 1:", { exact: false })).toHaveCount(1);
  await expect(hidd).not.toContainText("Scope 3:");
  await expect(hidd).toContainText("2/3");

  // Country filter narrows the list and lives in the URL.
  await page.getByRole("button", { name: /Country:/ }).click();
  // click, not check(): the box turns on only after the URL round trip.
  await page.getByRole("checkbox", { name: "India" }).click();
  await expect(page.getByRole("checkbox", { name: "India" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/country=2/);
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByTestId("setup-summary")).toHaveText("1 site of 2");
  await page.getByRole("button", { name: /Clear all/ }).click();

  // Add site: client and country are required.
  await page.getByRole("button", { name: "Add site" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add site" });
  await drawer.getByLabel("Site name").fill("Sitra");
  await drawer.getByLabel("Address").fill("Sitra Causeway");
  await drawer.getByLabel("Contact person").fill("Layla");
  await drawer.getByRole("button", { name: "Add site" }).click();
  await expect(drawer.getByText("Choose the client this site belongs to.")).toBeVisible();
  await expect(drawer.getByText("Choose a country.")).toBeVisible();
  expect(calls).toHaveLength(0);
  await pick(page, "Client", "Midal Cables");
  await pick(page, "Country", "Bahrain");

  await drawer.getByRole("tab", { name: /Categories/ }).click();
  await drawer.getByRole("button", { name: "Select all in Scope 1" }).click();
  await drawer.getByRole("checkbox", { name: "Electricity" }).check();
  await expect(drawer.getByRole("tab", { name: /Categories/ })).toContainText("3");
  await drawer.getByRole("button", { name: "Add site" }).click();

  await expect(page.getByText('Site "Sitra" added')).toBeVisible();
  expect(calls).toEqual([
    {
      method: "POST",
      path: expect.stringMatching(/\/admin\/sites$/),
      body: { name: "Sitra", address: "Sitra Causeway", contact_person: "Layla", company_id: 1, country_id: 1, category_ids: [1, 2, 3] },
    },
  ]);
  await expect(table.getByRole("row", { name: /Sitra/ })).toContainText("0/3");
});

test("a superadmin edits a site, sees its people and deletes it after typing its name", async ({ page }) => {
  const { calls } = await signIn(page);
  await page.goto("/setup/sites");
  await page.getByRole("button", { name: "Edit Hidd" }).click();
  await expect(page).toHaveURL(/open=1/);
  // A shared link opens the same drawer, filled once the site loads.
  await page.reload();
  const drawer = page.getByRole("dialog", { name: "Hidd" });
  await expect(drawer.getByRole("tab", { name: /Categories/ })).toContainText("3");

  await drawer.getByRole("tab", { name: /People/ }).click();
  await expect(drawer.getByText("Omar Saleh")).toBeVisible();
  await expect(drawer.getByText("Mia Manager")).toBeVisible();
  await drawer.getByRole("tab", { name: /Capture/ }).click();
  await expect(drawer.getByText("2 of 3 are set up.")).toBeVisible();

  await drawer.getByRole("tab", { name: /Details/ }).click();
  await drawer.getByLabel("Contact person").fill("Omar Saleh");
  await drawer.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText('Site "Hidd" saved')).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "PUT", body: { contact_person: "Omar Saleh", category_ids: [1, 2, 3] } });

  await page.getByRole("row", { name: /Hidd/ }).click();
  await page.getByRole("dialog", { name: "Hidd" }).getByRole("button", { name: "Delete site" }).click();
  const confirm = page.getByRole("alertdialog", { name: 'Delete site "Hidd"?' });
  await expect(confirm.getByTestId("delete-cascades")).toContainText("1 user account assigned to this site (Omar Saleh)");
  const del = confirm.getByRole("button", { name: "Delete site" });
  await expect(del).toBeDisabled();
  await confirm.getByLabel(/Type Hidd to confirm/).fill("hidd");
  await del.click();
  await expect(page.getByText('Site "Hidd" deleted')).toBeVisible();
  expect(calls.at(-1)).toMatchObject({ method: "DELETE", path: expect.stringMatching(/\/admin\/sites\/1$/) });
  await expect(sitesTable(page).getByRole("row")).toHaveCount(2);
});
