import { readFile } from "node:fs/promises";
import { type Page, expect, test } from "@playwright/test";

/**
 * P10 GHG report smoke tests. The report endpoints are
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

function tables(body: Body, empty = false, scope3 = 0) {
  const site = (siteId: number, siteName: string, value: number) => ({ siteId, siteName, value });
  const selected = empty
    ? []
    : [
        { scope: "Scope 1", category: "Diesel", bySite: [site(1, "Hidd", 30)], total: 30 },
        { scope: "Scope 2", category: "Electricity", bySite: [site(1, "Hidd", 50), site(2, "Sitra", 20)], total: 70 },
        { scope: "", category: "Renewable Electricity", bySite: [site(2, "Sitra", 4)], total: 4 },
        ...(scope3 > 0 ? [{ scope: "Scope 3", category: "Purchased goods", bySite: [site(2, "Sitra", scope3)], total: scope3 }] : []),
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
      [y]: empty ? { scope1: 0, scope2: 0, scope3: 0, total: 0 } : { scope1: 30, scope2: 70, scope3, total: 100 + scope3 },
      [p]: { scope1: 40, scope2: 85, scope3: 0, total: 125 },
    },
    tables: {
      table1_emissionsByScope_twoYears: [],
      table_overviewByLocations_selectedYear: { year: body.year, rows: selected },
      table_overviewByLocations_compareYear: { year: body.year - 1, rows: compare },
    },
  };
}

const S3_NAMES = [
  "Purchased goods and services",
  "Capital goods",
  "Fuel- and energy-related activities",
  "Upstream transportation and distribution",
  "Waste generated in operations",
  "Business travel",
  "Employee commuting",
  "Upstream leased assets",
  "Downstream transportation and distribution",
  "Processing of sold products",
  "Use of sold products",
  "End-of-life treatment of sold products",
  "Downstream leased assets",
  "Franchises",
  "Investments",
];

/** GET /reports/ghg/scope3 (S3-13): Cat 1 and 6 with emissions, Cat 9 excluded, 13–15 not relevant. */
function scope3Report() {
  const row = (n: number | null) => ({
    n,
    name: n === null ? "Unmapped" : S3_NAMES[n - 1],
    direction: n === null ? null : n <= 8 ? "upstream" : "downstream",
    status: n === null ? null : n === 9 ? "excluded" : n >= 13 ? "not_relevant" : n === 1 || n === 6 ? "included" : "screening",
    reason: n === 9 ? "Customers collect at the gate" : n !== null && n >= 13 ? "No leased-out assets, franchises or investments" : null,
    method_note: n === 1 ? "Spend for services, supplier figures for steel" : null,
    tco2e: n === 1 ? 45 : n === 6 ? 15 : 0,
    share_pct: n === 1 ? 75 : n === 6 ? 25 : 0,
    methods: n === 1 ? { supplier_specific: 60, spend_based: 40 } : n === 6 ? { distance_based: 100 } : {},
    primary_pct: n === 1 ? 60 : 0,
    value_chain_pct: n === 1 ? 60 : 0,
    proxy_pct: 0,
    dq: n === 1 ? { overall: 1.8, good_pct: 30, fair_pct: 70, poor_pct: 0 } : { overall: null, good_pct: 0, fair_pct: 0, poor_pct: 0 },
    datasets: n === 6 ? [{ dataset: "DEFRA", version: "2025", factor_type: "life_cycle" }] : [],
    gwp_sets: n === 6 ? ["AR6"] : [],
    biogenic_tco2e: null,
    mapped_categories: n === 1 ? [{ category_id: 30, name: "Steel" }] : n === 6 ? [{ category_id: 31, name: "Flights" }] : [],
    rf: n === 6 ? "with" : null,
    proxy_basis: [],
  });
  return {
    company_id: 1,
    consolidation_approach: "financial_control",
    period: { label: "CY2025", year: 2025, year_type: "CY" },
    total_tco2e: 60,
    gwp_sets: ["AR6"],
    tracked: { method: true, dq: true, data_type: true, proxy: false, biogenic: false, gases: false, total_kgco2e: false },
    rows: [...Array.from({ length: 15 }, (_, i) => row(i + 1)), row(null)],
  };
}

async function signIn(page: Page, opts: { emptyYear?: number; failScope3?: boolean; scope3?: number } = {}) {
  const bodies: Body[] = [];
  const scope3: URLSearchParams[] = [];
  const details: Body[] = [];
  const pdf: { query: URLSearchParams; auth: string }[] = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4173",
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
      if (path.endsWith("/reports/ghg/scope3")) {
        scope3.push(url.searchParams);
        if (opts.failScope3) return route.fulfill({ status: 500, json: { message: "Database unavailable" } });
        return json(scope3Report());
      }
      if (path.endsWith("/reports/ghg")) {
        pdf.push({ query: url.searchParams, auth: route.request().headers()["authorization"] ?? "" });
        return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 test" });
      }
      if (path.endsWith("/user/ghg/details")) {
        details.push(route.request().postDataJSON() as Body);
        const r = (scope: string, categoryName: string, siteId: number, siteName: string, prev: number, sel: number) => ({
          scope,
          categoryId: siteId * 10,
          categoryName,
          fuelType: categoryName,
          siteId,
          siteName,
          compare: { consumption: prev * 100, unit: "L", emissions: prev },
          selected: { consumption: sel * 100, unit: "L", emissions: sel },
        });
        return json({ filters: {}, ranges: {}, rows: [r("Scope 1", "Diesel", 1, "Hidd", 40, 30), r("Scope 2", "Electricity", 1, "Hidd", 85, 50), r("Scope 2", "Electricity", 2, "Sitra", 0, 20)] });
      }
      if (path.endsWith("/user/ghg/tables")) {
        const body = route.request().postDataJSON() as Body;
        bodies.push(body);
        return json(tables(body, body.year === opts.emptyYear, opts.scope3));
      }
      return json({});
    },
  );
  return { bodies, details, pdf, scope3, last: () => bodies[bodies.length - 1] };
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

test("scope tabs load detail rows on demand, and findings follow the PDF", async ({ page }) => {
  const { details } = await signIn(page);
  await page.goto("/reports/ghg?year=2025");
  await expect(page.getByText("Comparing CY 2025 with CY 2024")).toBeVisible();

  // The intro is a dismissible note that stays dismissed.
  await page.getByRole("button", { name: /Dismiss/i }).click();
  await expect(page.getByText("About GHG reporting")).toHaveCount(0);
  expect(details).toHaveLength(0);

  await page.getByRole("tab", { name: "Scope 2" }).click();
  const table = page.getByRole("table", { name: "Scope 2 emissions by category and site" });
  await expect(table.getByRole("row", { name: /Sitra/ })).toContainText("20 tCO₂e");
  expect(details[0]).toEqual({ siteIds: [1, 2], yearType: "CY", year: 2025, frequency: "yearly" });

  await page.getByRole("tab", { name: "Findings" }).click();
  await expect(page.getByText("Total CY 2025 emissions were 100 tCO₂e (down 20.0% vs CY 2024).")).toBeVisible();
  await expect(page.getByText("Hidd is the largest contributing site at 80 tCO₂e (80.0% of total).")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("tab", { name: "Findings", selected: true })).toBeVisible();
  await expect(page.getByText("About GHG reporting")).toHaveCount(0);
});

test("when Scope 3 is the largest, the findings name it and add the supplier action (S3-4)", async ({ page }) => {
  await signIn(page, { scope3: 150 });
  await page.goto("/reports/ghg?year=2025");
  await expect(page.getByText("Comparing CY 2025 with CY 2024")).toBeVisible();
  await page.getByRole("tab", { name: "Findings" }).click();
  await expect(page.getByText("Scope 3 (value chain) dominates the footprint at 60.0%", { exact: false })).toBeVisible();
  await expect(page.getByText("Engage the largest suppliers for their own emissions data.")).toBeVisible();
});

test("the branded PDF downloads with the auth header, not a token in the URL", async ({ page }) => {
  const { pdf, details } = await signIn(page);
  await page.goto("/reports/ghg?cal=FY&freq=month&year=2025&month=6");
  await expect(page.getByText("Comparing June 2024 with June 2023")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download branded PDF" }).click();
  expect((await download).suggestedFilename()).toBe("ghg-report-june-2024.pdf");
  expect(pdf).toHaveLength(1);
  expect(pdf[0].auth).toBe("Bearer test-token");
  expect(pdf[0].query.has("token")).toBe(false);
  expect(Object.fromEntries(pdf[0].query)).toEqual({ siteIds: "1,2", yearType: "FY", year: "2025", frequency: "monthly", month: "6", download: "1" });
  await expect(page.getByText("Branded PDF downloaded")).toBeVisible();

  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export tables" }).click();
  expect((await xlsx).suggestedFilename()).toBe("ghg-report-june-2024.xlsx");
  // The export loads the detail rows for the period on screen, even from the Summary tab.
  expect(details.at(-1)).toEqual({ siteIds: [1, 2], yearType: "FY", year: 2025, frequency: "monthly", month: 6 });
});

test("Scope 3 by GHG category, its exclusions, the Methodology tab and the XLSX sheets (S3-13)", async ({ page }) => {
  const { scope3 } = await signIn(page);
  await page.goto("/reports/ghg?year=2025&tab=scope3");

  const table = page.getByRole("table", { name: "Scope 3 emissions by GHG Protocol category" });
  // 15 categories (Unmapped is hidden while it has nothing) plus the header row.
  await expect(table.getByRole("row")).toHaveCount(16);
  await expect(table.getByRole("row", { name: /1 · Purchased goods/ })).toContainText("Supplier's own figure 60%, From the amount spent 40%");
  await expect(table.getByRole("row", { name: /1 · Purchased goods/ })).toContainText("Fair · 1.8");
  await expect(page.getByText("Customers collect at the gate")).toBeVisible();
  expect(Object.fromEntries(scope3[0])).toEqual({ siteIds: "1,2", yearType: "CY", year: "2025", frequency: "yearly" });

  // Methodology tab, reached with the keyboard from the Scope 3 tab.
  await page.getByRole("tab", { name: "Scope 3", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Methodology", selected: true })).toBeFocused();
  await expect(page).toHaveURL(/tab=methodology/);
  await expect(page.getByText("Financial control approach.")).toBeVisible();
  await expect(page.getByText("100-year GWP values from IPCC AR6.")).toBeVisible();
  await expect(page.getByText("Spend for services, supplier figures for steel")).toBeVisible();
  await expect(page.getByText("No Scope 3 base year set.")).toBeVisible();
  await expect(page.getByText("Flights with radiative forcing")).toBeVisible();

  // The XLSX carries both Scope 3 sheets.
  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export tables" }).click();
  const file = await (await xlsx).path();
  const XLSX = await import("xlsx");
  const book = XLSX.read(await readFile(file!));
  expect(book.SheetNames).toEqual(expect.arrayContaining(["Scope 3 by category", "Scope 3 methodology"]));
  const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets["Scope 3 by category"], { header: 1 });
  expect(rows[9][2]).toBe("Customers collect at the gate");
});

test("the table export still works when Scope 3 by category can't load", async ({ page }) => {
  await signIn(page, { failScope3: true });
  await page.goto("/reports/ghg?year=2025");
  await expect(page.getByText(/^Comparing /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Export tables" })).toBeEnabled();
  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export tables" }).click();
  const file = await (await xlsx).path();
  await expect(page.getByText("Scope 3 sheets left out")).toBeVisible();
  const XLSX = await import("xlsx");
  const book = XLSX.read(await readFile(file!));
  expect(book.SheetNames.length).toBeGreaterThan(0);
  expect(book.SheetNames).not.toContain("Scope 3 by category");
});

test("the SBTi 67 % hint shows when Scope 3 is at least 40 % of the total", async ({ page }) => {
  await signIn(page);
  await page.goto("/reports/ghg?year=2025&tab=scope3");
  // The fixture report has 60 t of Scope 3 against a 100 t page total (60 %).
  await expect(page.getByText("SBTi near-term targets must cover at least 67 % of Scope 3.")).toBeVisible();
  await expect(page.getByText(/Category 1 covers 75 %/)).toBeVisible();
});

test("the SBTi hint stays hidden while a category filter narrows the report", async ({ page }) => {
  await signIn(page);
  await page.goto("/reports/ghg?year=2025&tab=scope3&category=10");
  await expect(page.getByRole("table", { name: "Scope 3 emissions by GHG Protocol category" })).toBeVisible();
  await expect(page.getByText("SBTi near-term targets must cover at least 67 % of Scope 3.")).toHaveCount(0);
});

test("a superadmin reports on the picked client's sites only", async ({ page }) => {
  const bodies: Body[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Superadmin");
    localStorage.setItem("user", JSON.stringify({ name: "Sam Staff", email: "sam@example.com" }));
  });
  await page.route(
    (url) => url.port !== "4173",
    (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Superadmin", user: { name: "Sam Staff" } });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/admin/companies")) return json({ companies: [company, { company_id: 2, name: "Other Co" }] });
      if (path.endsWith("/admin/sites"))
        return json([
          { site_id: 1, name: "Hidd", company, categories: [] },
          { site_id: 9, name: "Elsewhere", company: { company_id: 2, name: "Other Co" }, categories: [] },
        ]);
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/user/ghg/tables")) {
        const body = route.request().postDataJSON() as Body;
        bodies.push(body);
        return json(tables(body));
      }
      return json({});
    },
  );

  await page.goto("/reports/ghg?year=2025");
  await expect(page.getByText("Pick a client first")).toBeVisible();
  expect(bodies).toHaveLength(0);

  await page.evaluate(() => localStorage.setItem("esglite.clientId", "1"));
  await page.reload();
  await expect(page.getByText("Comparing CY 2025 with CY 2024")).toBeVisible();
  await expect.poll(() => bodies[bodies.length - 1]?.siteIds).toEqual([1]);
});
