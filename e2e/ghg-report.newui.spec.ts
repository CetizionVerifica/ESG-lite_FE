import { type Page, expect, test } from "@playwright/test";

/**
 * P10 GHG report smoke tests (VITE_NEW_UI=1 server). The report endpoints are
 * answered locally and every request body is recorded, so the tests can check
 * what the page asked for after each filter change.
 */

const company = { company_id: 1, name: "Midal Cables" };
const user = {
  name: "Mia Manager",
  email: "mia@example.com",
  sites: [
    { site_id: 1, name: "Hidd", company, categories: [{ category_id: 10, category_name: "Diesel" }] },
    { site_id: 2, name: "Sitra", company, categories: [{ category_id: 20, category_name: "Electricity" }] },
  ],
};

type Body = { siteIds: number[]; yearType: string; year: number; frequency: string; month?: number; quarter?: number; categoryIds?: number[] };

function tables(body: Body, empty = false) {
  const site = (siteId: number, siteName: string, value: number) => ({ siteId, siteName, value });
  const selected = empty
    ? []
    : [
        { scope: "Scope 1", category: "Diesel", bySite: [site(1, "Hidd", 30)], total: 30 },
        { scope: "Scope 2", category: "Electricity", bySite: [site(1, "Hidd", 50), site(2, "Sitra", 20)], total: 70 },
        { scope: "", category: "Renewable Electricity", bySite: [site(2, "Sitra", 4)], total: 4 },
      ];
  const compare = [
    { scope: "Scope 1", category: "Diesel", bySite: [site(1, "Hidd", 40)], total: 40 },
    { scope: "Scope 2", category: "Electricity", bySite: [site(1, "Hidd", 85)], total: 85 },
  ];
  const y = String(body.year);
  const p = String(body.year - 1);
  return {
    filters: { siteIds: body.siteIds, categoryIds: null, yearType: body.yearType, year: body.year, compareYear: body.year - 1, fiscalYearStartMonth: 4 },
    ranges: {},
    totals: {
      [y]: empty ? { scope1: 0, scope2: 0, scope3: 0, total: 0 } : { scope1: 30, scope2: 70, scope3: 0, total: 100 },
      [p]: { scope1: 40, scope2: 85, scope3: 0, total: 125 },
    },
    tables: {
      table1_emissionsByScope_twoYears: [],
      table_overviewByLocations_selectedYear: { year: body.year, rows: selected },
      table_overviewByLocations_compareYear: { year: body.year - 1, rows: compare },
    },
  };
}

async function signIn(page: Page, opts: { emptyYear?: number } = {}) {
  const bodies: Body[] = [];
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
      if (path.endsWith("/user/reporting-calendar")) return json({ fiscalYearStartMonth: 4, fiscalYearRule: "" });
      if (path.endsWith("/user/ghg/tables")) {
        const body = route.request().postDataJSON() as Body;
        bodies.push(body);
        return json(tables(body, body.year === opts.emptyYear));
      }
      return json({});
    },
  );
  return { bodies, last: () => bodies[bodies.length - 1] };
}

test("a manager compares a year with the last one and narrows it live", async ({ page }) => {
  const { last } = await signIn(page);
  await page.goto("/reports/ghg?cal=CY&freq=year&year=2025");

  await expect(page.getByRole("heading", { level: 1, name: "GHG report" })).toBeVisible();
  await expect(page.getByText("Comparing CY 2025 with CY 2024")).toBeVisible();
  expect(last()).toEqual({ siteIds: [1, 2], yearType: "CY", year: 2025, frequency: "yearly" });

  // KPI strip: total with the change and renewables saved, coverage, largest source.
  const kpi = page.locator("dl").first();
  await expect(kpi).toContainText("Total emissions");
  await expect(kpi).toContainText("▼ 20.0%");
  await expect(kpi).toContainText("Saved 4");
  await expect(kpi).toContainText("2 of 2 sites");
  await expect(kpi).toContainText("Electricity");

  // Summary: Table 1 and the top categories show both years.
  const table1 = page.getByRole("table", { name: "Emissions by scope" });
  await expect(table1).toContainText("CY 2024 tCO₂e");
  await expect(table1.getByRole("row", { name: /Scope 2/ })).toContainText("▼ 17.6%");
  await expect(page.getByRole("table", { name: "Emissions by category, top 10" })).toContainText("Diesel");

  // By location: site × scope for both years, kept in the URL.
  await page.getByRole("tab", { name: "By location" }).click();
  await expect(page).toHaveURL(/tab=location/);
  await expect(page.getByRole("table", { name: "Emissions by site and scope" }).getByRole("row", { name: /Sitra/ })).toBeVisible();

  // Switching to FY quarters updates the report in place, without a wizard step.
  await page.getByRole("radio", { name: "FY" }).click();
  await page.getByRole("radio", { name: "Quarter" }).click();
  await page.getByLabel("Quarter", { exact: true }).selectOption({ label: "Q2 (Jul–Sep 2024)" });
  await expect(page.getByText("Comparing Q2 FY 2024-25 (Jul–Sep 2024) with Q2 FY 2023-24 (Jul–Sep 2023)")).toBeVisible();
  await expect.poll(() => last()).toEqual({ siteIds: [1, 2], yearType: "FY", year: 2025, frequency: "quarterly", quarter: 2 });
  await expect(page).toHaveURL(/cal=FY&freq=quarter&year=2025&quarter=2/);
});

test("narrowing to one site sends only that site and its categories", async ({ page }) => {
  const { last } = await signIn(page);
  await page.goto("/reports/ghg?year=2025&site=2");

  await expect.poll(() => last()?.siteIds).toEqual([2]);
  await page.getByRole("button", { name: /Categories/ }).click();
  await expect(page.getByRole("checkbox", { name: "Diesel" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Electricity" }).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => last()?.categoryIds).toEqual([20]);
});

test("an empty period offers the year before", async ({ page }) => {
  const { last } = await signIn(page, { emptyYear: 2025 });
  await page.goto("/reports/ghg?year=2025");

  await expect(page.getByText("Nothing recorded for CY 2025.")).toBeVisible();
  await page.getByRole("button", { name: "Try CY 2024" }).click();
  await expect.poll(() => last()?.year).toBe(2024);
  await expect(page.getByText("Comparing CY 2024 with CY 2023")).toBeVisible();
});
