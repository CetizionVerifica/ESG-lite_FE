import { type Page, expect, test } from "@playwright/test";

/**
 * P16 Console smoke tests (VITE_NEW_UI=1 server). Every Superadmin list
 * endpoint the Console aggregates is answered from fixed data.
 */

const staff = { name: "Sam Staff", email: "sam@example.com" };
const companies = [
  { company_id: 1, name: "Midal Cables", status: true },
  { company_id: 2, name: "Glochem", status: true },
  { company_id: 3, name: "Old Co", status: false },
];
const sites = [
  { site_id: 10, name: "Hidd", company: { company_id: 1, name: "Midal Cables" }, categories: [{ category_id: 1, category_name: "Fuel" }] },
  {
    site_id: 20,
    name: "Dammam",
    company: { company_id: 2, name: "Glochem" },
    categories: [
      { category_id: 1, category_name: "Fuel" },
      { category_id: 2, category_name: "Electricity" },
      { category_id: 3, category_name: "Water" },
    ],
  },
];
const midalBrand = {
  companyId: 1,
  name: "Midal Cables",
  primary: "#1f2a44",
  accent: "#3b82f6",
  coverFrom: "#0d1526",
  coverTo: "#1f2a44",
  logoUrl: "data:image/png;base64,iVBORw0KGgo=",
  logoOnDarkUrl: "data:image/png;base64,iVBORw0KGgo=",
  defaultLook: "classic",
  updatedAt: "2026-10-01T10:00:00.000Z",
};

async function signIn(page: Page, opts: { failCompanies?: boolean } = {}) {
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", u);
  }, JSON.stringify(staff));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user: staff });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/admin/companies")) return opts.failCompanies ? json({ message: "Database is down" }, 500) : json(companies);
      if (path.endsWith("/admin/sites")) return json(sites);
      if (path.endsWith("/admin/users"))
        return json([
          { user_id: 1, role: "Superadmin" },
          { user_id: 2, role: "User", site: { site_id: 10 } },
          { user_id: 3, role: "Manager", site: null, sites: [{ site_id: 20 }] },
        ]);
      if (path.endsWith("/admin/column-configs")) return json([{ site: { site_id: 10 }, category: { category_id: 1 } }]);
      if (path.endsWith("/admin/units")) return json([{ site: { site_id: 10 }, category: { category_id: 1 } }]);
      if (path.endsWith("/admin/thresholds")) return json([{ company: { company_id: 1 } }]);
      if (path.endsWith("/admin/emission-factors/batches"))
        return json([
          { upload_batch_id: "b1", count: 42, uploaded_at: new Date().toISOString(), site_id: 20, site_name: "Dammam", category_id: 2, category_name: "Electricity" },
        ]);
      if (path.endsWith("/admin/emission-factors")) {
        const site = url.searchParams.get("site_id");
        const year = site === "10" ? new Date().getFullYear() - 1 : site === "20" ? 2022 : undefined;
        return json({ data: year ? [{ year }] : [], total: site ? 1 : 312, page: 1, limit: 1, totalPages: 1 });
      }
      if (path.endsWith("/brands/1")) return json(midalBrand);
      if (/\/brands\/\d+$/.test(path)) return json({ ...midalBrand, companyId: 0, logoUrl: null, logoOnDarkUrl: null, updatedAt: undefined });
      return json({});
    },
  );
}

const clientsTable = (page: Page) => page.getByRole("table", { name: "Clients" });

test("superadmin sees client health, setup gaps and recent uploads", async ({ page }) => {
  await signIn(page);
  // The old landing paths still arrive here.
  await page.goto("/superadmin");
  await expect(page).toHaveURL(/\/console/);
  await expect(page.getByRole("heading", { name: "Console" })).toBeVisible();

  const table = clientsTable(page);
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("row", { name: /Midal Cables/ })).toContainText("100%");
  const glochem = table.getByRole("row", { name: /Glochem/ });
  await expect(glochem).toContainText("Default");
  await expect(table.getByRole("row", { name: /Old Co/ })).toContainText("Inactive");

  const gaps = page.getByTestId("setup-gaps");
  await expect(gaps).toContainText("Dammam · 3 categories have no column config");
  await expect(gaps).toContainText("Glochem · no threshold set");
  await expect(gaps).toContainText("Glochem · no brand theme set");
  // Inactive clients don't add gaps.
  await expect(gaps).not.toContainText("Old Co");

  await expect(page.getByTestId("recent-activity")).toContainText("Factor upload · 42 factors");
  await expect(page.getByTestId("recent-activity")).toContainText("Glochem · Dammam · Electricity");

  await gaps.getByRole("link", { name: /no threshold set/ }).click();
  await expect(page).toHaveURL(/\/factors\/thresholds$/);
  await page.goBack();

  await clientsTable(page).getByRole("row", { name: /Glochem/ }).click();
  await expect(page).toHaveURL(/\/clients\/2$/);
});

test("onboard client opens the onboarding page and load errors offer a retry", async ({ page }) => {
  await signIn(page, { failCompanies: true });
  await page.goto("/console");
  await expect(page.getByText("Database is down")).toBeVisible();
  await expect(page.getByRole("button", { name: /Retry|Try again/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Onboard client" }).click();
  await expect(page).toHaveURL(/\/clients\/new$/);
});

for (const width of [1280, 1024, 768, 390]) {
  test(`fits ${width}px without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await page.goto("/console");
    await expect(clientsTable(page).getByRole("row", { name: /Glochem/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
