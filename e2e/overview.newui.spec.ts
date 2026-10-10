import { type Page, expect, test } from "@playwright/test";

/**
 * P06 Overview smoke tests (VITE_NEW_UI=1 server). B4 and the other manager
 * endpoints are answered locally; B4 requests are recorded so the tests can
 * check the period and sites the page asked for.
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

const kpis = (net: number, approved = 6) => ({
  gross: net + 2,
  net,
  saved: 2,
  scope_1: 30,
  scope_2: net + 2 - 30,
  scope_3: 0,
  entries: 9,
  approved_count: approved,
  pending_count: 3,
  rejected_count: 0,
  pending_emission: 1.2,
  net_vs_last_year_pct: null,
});

function overview(period: string) {
  return {
    period: { key: period },
    site_ids: [1, 2],
    category_id: null,
    kpis: { ...kpis(120), net_vs_last_year_pct: -4 },
    by_scope: [],
    by_site: [
      { site_id: 1, name: "Hidd", total: 80, gross: 80, saved: 0, net: 80, entries: 5, approved: 3, pending: 2, rejected: 0, net_vs_last_year_pct: -10 },
      { site_id: 2, name: "Sitra", total: 42, gross: 42, saved: 2, net: 40, entries: 4, approved: 3, pending: 0, rejected: 0, net_vs_last_year_pct: 5 },
    ],
    by_month: [],
    yearly_total: 12.5,
    by_category: [
      { category_id: 20, category_name: "Electricity", scope: "Scope 2", total: 92 },
      { category_id: 10, category_name: "Diesel", scope: "Scope 1", total: 30 },
    ],
    submission: {
      month: "2025-09",
      submitted: 1,
      missing: 1,
      users: [
        { user_id: 4, name: "Omar Contributor", email: "o@x.com", site_name: "Hidd", submission_count: 3, status: "submitted" },
        { user_id: 5, name: "Lina Late", email: "l@x.com", site_name: "Sitra", submission_count: 0, status: "missing" },
      ],
    },
    trend: ["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"].map((month, i) => ({ month, gross: 20 + i, saved: 1, net: 19 + i })),
    last_year: { period: {}, status: "complete", kpis: kpis(125), by_site: [] },
  };
}

async function signIn(page: Page) {
  const b4: URLSearchParams[] = [];
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
      if (path.endsWith("/manager/overview")) {
        b4.push(url.searchParams);
        return json(overview(url.searchParams.get("period") ?? ""));
      }
      if (path.endsWith("/manager/submission-status")) return json({ users: overview("").submission.users });
      if (path.endsWith("/user/emissions") && url.searchParams.get("scope") === "Scope 2")
        return json({
          data: [
            { pk_id: 1, date_of_reporting: "2025-09-30", total_emission: 1.5, activity_data: { quantity: "1200" }, activity_data_unit: "kWh" },
            { pk_id: 2, date_of_reporting: "2025-08-31", total_emission: 1.2, activity_data: { quantity: "1000" }, activity_data_unit: "kWh" },
          ],
          total: 2,
          summary: {},
        });
      if (path.endsWith("/user/emissions")) return json({ data: [], total: 0, summary: { total_emission: 0, pending_count: 7, approved_count: 0, rejected_count: 0 } });
      if (path.endsWith("/user/production-data/manager")) return json([{ production_id: 1, status: "pending", site: { site_id: 2, name: "Sitra" } }]);
      if (path.includes("/user/thresholds/company/")) return json({ threshold_percentage: 5 });
      if (path.includes("/user/emission-intensity/comparison"))
        return json({ comparison: [{ siteId: 1, totalEmissions: 80, totalProduction: 400, emissionIntensity: 0.2 }], dateRange: {} });
      if (/\/user\/emission-intensity\/site\/\d+$/.test(path))
        return json({ totalEmissions: 80, productionByUnit: [{ unit: "t", totalProduction: 400, emissionIntensity: 0.2 }], monthlyData: [{ month: "2025-09", emissions: 8, production: 40, intensity: 0.2 }], dateRange: {} });
      return json({});
    },
  );
  return { b4 };
}

test("a manager sees the period at a glance and drills into a site", async ({ page }) => {
  const { b4 } = await signIn(page);
  await page.goto("/overview?period=CY2025");

  await expect(page.getByRole("heading", { level: 1, name: "CY 2025" })).toBeVisible();
  expect(b4[0].get("period")).toBe("2025");
  expect(b4[0].get("siteIds")).toBe("1,2");

  // KPI strip: net with the change vs last year, intensity combined over both sites.
  const kpi = page.locator("dl").first();
  await expect(kpi).toContainText("Net emissions");
  await expect(kpi).toContainText("120");
  await expect(kpi).toContainText("▼ 4.0%");
  await expect(kpi).toContainText("tCO₂e/unit, combined");

  // Attention: pending queue, missing person, pending production.
  const attention = page.getByRole("region", { name: /Needs your attention/ });
  await expect(attention.getByRole("link", { name: "7 entries waiting for approval (all periods)" })).toHaveAttribute("href", "/data/approvals?period=all");
  await expect(attention).toContainText("1 person missing Sep 2025");
  await expect(attention).toContainText("1 production record pending");

  await expect(page.getByText("Electricity is 75% of the gross footprint.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Contributors for Sep 2025" })).toContainText("Lina Late");

  // The trend's table view carries the yearly filing as its own row.
  await page.getByRole("radio", { name: "Table" }).first().click();
  await expect(page.getByRole("figure").first()).toContainText("Yearly filing");

  // A category bar and a site row open the ledger filtered the same way.
  await expect(page.getByRole("link", { name: /Diesel/ })).toHaveAttribute("href", "/data/ledger?category=10&period=CY2025&status=approved");
  const sites = page.getByRole("table", { name: "Emissions by site" });
  await expect(sites.getByRole("row", { name: /Hidd/ })).toContainText("2 pending");
  await sites.getByRole("row", { name: /Hidd/ }).click();
  await expect(page).toHaveURL(/\/data\/ledger\?site=1&period=CY2025&status=approved/);
});

test("period chips map to B4's period form and stay in the URL", async ({ page }) => {
  const { b4 } = await signIn(page);
  await page.goto("/overview?period=FY2025&site=2");
  await expect(page.getByRole("heading", { level: 1, name: "FY 2025-26" })).toBeVisible();
  await expect.poll(() => b4.at(-1)?.get("period")).toBe("FY2025-26");
  expect(b4.at(-1)?.get("siteIds")).toBe("2");

  await page.getByRole("button", { name: "Previous period" }).click();
  await expect(page).toHaveURL(/period=FY2024/);
  await expect(page.getByRole("heading", { level: 1, name: "FY 2024-25" })).toBeVisible();
  await expect.poll(() => b4.at(-1)?.get("period")).toBe("FY2024-25");
});

test("the lower tabs load on demand and follow the header context", async ({ page }) => {
  const { b4 } = await signIn(page);
  await page.goto("/overview?period=2025-09&view=scope2");
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("heading", { name: "Scope 2 electricity" })).toBeVisible();
  await panel.getByRole("radio", { name: "Table" }).click();
  await expect(panel.getByRole("row", { name: /Sep 2025/ })).toContainText("1,200");

  await page.getByRole("tab", { name: "Intensity" }).click();
  await expect(page).toHaveURL(/view=intensity/);
  await page.getByRole("tabpanel").getByRole("radio", { name: "Table" }).click();
  // Two sites, 8 t over 40 units each: combined 16 / 80.
  await expect(page.getByRole("tabpanel").getByRole("row", { name: /Sep 2025/ })).toContainText("0.2000");

  await page.getByRole("tab", { name: "Year over year" }).click();
  const years = page.getByRole("group", { name: "Years" });
  const third = years.getByRole("button").nth(2);
  const year = (await third.textContent())!.trim();
  await third.click();
  await expect(third).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => b4.some((p) => p.get("period") === year)).toBe(true);

  await page.getByRole("tab", { name: "Site comparison" }).click();
  await page.getByRole("tabpanel").getByRole("radio", { name: "Table" }).click();
  await expect(page.getByRole("tabpanel").getByRole("row", { name: /Hidd/ })).toContainText("80");
});
