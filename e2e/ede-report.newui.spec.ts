import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";

/**
 * P11 EDE report smoke tests (VITE_NEW_UI=1 server). The EDE endpoint is
 * answered locally and every request body is recorded.
 */

const company = { company_id: 1, name: "Midal Cables" };
const user = {
  name: "Mia Manager",
  email: "mia@example.com",
  sites: [
    {
      site_id: 1,
      name: "Hidd",
      company,
      categories: [{ category_id: 10, category_name: "Diesel" }],
    },
    {
      site_id: 2,
      name: "Sitra",
      company,
      categories: [{ category_id: 20, category_name: "Electricity" }],
    },
  ],
};

type Body = {
  siteIds: number[];
  frequency: string;
  year: number;
  month?: number;
  categoryIds?: number[];
};

function report(body: Body, empty = false) {
  if (empty)
    return {
      totals: { scope1: 0, scope2: 0, scope3: 0, total: 0 },
      bySite: [],
      siteDonut: [],
      monthlyBySite: [],
      savedBySite: [],
      renewableKwhBySite: [],
      intensityMonthly: [],
    };
  const y = body.year;
  return {
    totals: { scope1: 30, scope2: 70, scope3: 0, total: 100 },
    bySite: [
      {
        siteId: 1,
        siteName: "Hidd",
        scope1: 30,
        scope2: 50,
        scope3: 0,
        total: 80,
        pctOfTotal: 80,
      },
      {
        siteId: 2,
        siteName: "Sitra",
        scope1: 0,
        scope2: 20,
        scope3: 0,
        total: 20,
        pctOfTotal: 20,
      },
    ],
    siteDonut: [],
    monthlyBySite: [
      { month: `${y}-01`, siteId: 1, siteName: "Hidd", total: 80 },
      { month: `${y}-01`, siteId: 2, siteName: "Sitra", total: 20 },
    ],
    savedBySite: [{ siteId: 2, siteName: "Sitra", saved: 4 }],
    renewableKwhBySite: [{ siteId: 2, siteName: "Sitra", kwh: 12000, unit: "kWh" }],
    intensityMonthly: [
      {
        month: `${y}-01`,
        siteName: "Hidd",
        emissions: 80,
        production: 40,
        intensity: 2,
        unit: "t",
      },
    ],
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
      const path = new URL(route.request().url()).pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/user/reports/ede")) {
        const body = route.request().postDataJSON() as Body;
        bodies.push(body);
        return json(report(body, body.year === opts.emptyYear));
      }
      return json({});
    },
  );
  return { bodies, last: () => bodies[bodies.length - 1] };
}

test("a manager reads a year by site and narrows it to a month live", async ({ page }) => {
  const { last } = await signIn(page);
  await page.goto("/reports/ede?year=2025");

  await expect(page.getByRole("heading", { level: 1, name: "EDE report" })).toBeVisible();
  await expect(page.getByText("Approved data for CY 2025")).toBeVisible();
  expect(last()).toEqual({ siteIds: [1, 2], frequency: "yearly", year: 2025 });

  const kpi = page.locator("dl").first();
  await expect(kpi).toContainText("Total emissions");
  await expect(kpi).toContainText("Renewable produced");
  await expect(kpi).toContainText("12,000");

  await expect(page.getByRole("table", { name: "Footprint by site" }).getByRole("row", { name: /Hidd/ })).toContainText("80.0%");
  await expect(page.getByRole("table", { name: "Overall totals" })).toContainText("Emissions saved by renewables");
  await expect(page.getByText("Monthly emissions by site")).toBeVisible();
  await expect(page.getByText("Intensity trend")).toBeVisible();

  // FY and quarters wait for the backend.
  await expect(page.getByRole("radio", { name: "FY" })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Quarter" })).toBeDisabled();

  await page.getByRole("radio", { name: "Month" }).click();
  await page.getByLabel("Month", { exact: true }).selectOption({ label: "Jun 2025" });
  await expect.poll(() => last()).toEqual({ siteIds: [1, 2], frequency: "monthly", year: 2025, month: 6 });
  await expect(page).toHaveURL(/cal=CY&freq=month&year=2025&month=6/);
  await expect(page.getByText("Approved data for June 2025")).toBeVisible();
});

test("a GHG report link with an FY quarter falls back to the calendar year", async ({ page }) => {
  const { last } = await signIn(page);
  await page.goto("/reports/ede?cal=FY&freq=quarter&year=2025&quarter=2&site=1");
  await expect.poll(() => last()).toEqual({ siteIds: [1], frequency: "yearly", year: 2025 });
});

test("an empty period offers the year before", async ({ page }) => {
  const { last } = await signIn(page, { emptyYear: 2025 });
  await page.goto("/reports/ede?year=2025");

  await expect(page.getByText("Nothing approved for CY 2025.")).toBeVisible();
  await page.getByRole("button", { name: "Try CY 2024" }).click();
  await expect.poll(() => last()?.year).toBe(2024);
});

test("the PDF downloads with the company and period in its name", async ({ page }) => {
  await signIn(page);
  await page.goto("/reports/ede?year=2025");
  await expect(page.getByText("Intensity trend")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("EDE_Report_Midal_Cables_CY_2025.pdf");
  const bytes = readFileSync((await file.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});
