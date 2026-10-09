import { type Page, expect, test } from "@playwright/test";

/**
 * P12 Targets smoke tests (VITE_NEW_UI=1 server). The two SBTi endpoints and
 * B4 (for "years with data") are answered locally; target requests are
 * recorded so the tests can check what reached the server.
 */

const company = { company_id: 1, name: "Midal Cables" };
const SITES = [
  { site_id: 1, name: "Hidd", company },
  { site_id: 2, name: "Sitra", company },
];
const user = { name: "Mia Manager", email: "mia@example.com", sites: SITES };
const DATA_YEARS = [2022, 2023, 2024, 2025, 2026];

function nearTerm(body: { baseYear: number; targetYear: number; annualRate: number }) {
  const base = 1000;
  const years = Array.from({ length: body.targetYear - body.baseYear + 1 }, (_, n) => body.baseYear + n);
  const target = (n: number) => Number((base * (1 - body.annualRate) ** n).toFixed(3));
  return {
    heading: "Near-Term Target",
    method: "ABSOLUTE_CONTRACTION",
    annualRate: body.annualRate,
    baseYear: body.baseYear,
    targetYear: body.targetYear,
    horizonYears: body.targetYear - body.baseYear,
    scope3Share: 62,
    scope3TargetRequired: true,
    scope1And2CoveragePct: 38,
    scope1And2CoverageValid: false,
    baseTotals: { scope1: 230, scope2: 150, scope3: 620, total: 1000 },
    targetBoundaryBase: base,
    tables: {
      table1: years.map((year, n) => ({ year, n, calculation: "", targetEmission: target(n), reducedBy: n ? 1 : null, reducedByPct: n ? body.annualRate * 100 : null })),
      table2: years.map((year, n) => ({
        year,
        n,
        scope1Target: target(n) * 0.23,
        scope2Target: target(n) * 0.15,
        scope3Target: target(n) * 0.62,
        totalTarget: target(n),
        reducedBy: null,
        reducedByPct: null,
      })),
      table3: years.map((year, n) => {
        const actual = n === 0 ? base : DATA_YEARS.includes(year) ? target(n) + (n === 1 ? -5 : 30) : 0;
        return {
          year,
          actualScope1: actual * 0.23,
          actualScope2: actual * 0.15,
          actualScope3: actual * 0.62,
          actualTotal: actual,
          targetTotal: target(n),
          variance: actual ? actual - target(n) : 0,
          variancePct: null,
          status: n === 0 ? "Base Year" : !actual ? "No Data" : actual <= target(n) ? "Reached" : "Not Reached",
        };
      }),
    },
  };
}

async function signIn(page: Page) {
  const targets: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.addInitScript((u) => {
    localStorage.setItem("token", "test-token");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", u);
  }, JSON.stringify(user));
  await page.route(
    (url) => url.port !== "4174",
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
      if (path.endsWith("/auth/me")) return json({ role: "Manager", user });
      if (path.endsWith("/auth/me/appearance")) return json({ appearance: "light" });
      if (path.endsWith("/brands/mine")) return json({});
      if (path.endsWith("/notifications/unread")) return json({ count: 0 });
      if (path.endsWith("/notifications")) return json({ total: 0, notifications: [] });
      if (path.endsWith("/manager/overview")) {
        const year = Number(url.searchParams.get("period"));
        return json({ kpis: { gross: DATA_YEARS.includes(year) ? 500 : 0 }, yearly_total: 0 });
      }
      if (path.endsWith("/user/targets/tables")) {
        const body = request.postDataJSON();
        targets.push({ path, body });
        if (!DATA_YEARS.includes(body.baseYear)) return json({ message: `No approved emissions found for baseYear=${body.baseYear} with the provided filters.` }, 400);
        return json(nearTerm(body));
      }
      if (path.endsWith("/user/targets/long-term-chart")) {
        const body = request.postDataJSON();
        targets.push({ path, body });
        const n = 2050 - body.baseYear;
        return json({
          heading: "Long-Term Target",
          method: "",
          baseYear: body.baseYear,
          targetYear: 2050,
          years: n,
          annualRate: 1 - 0.1 ** (1 / n),
          baseEmissions: 380,
          targetEmissions: 38,
          totalReductionPct: 90,
          scope3Share: 20,
          scope3TargetRequired: false,
          baseTotals: { scope1: 230, scope2: 150, scope3: 95, total: 475 },
          rows: Array.from({ length: n + 1 }, (_, i) => {
            const t = Number((380 * (0.1 ** (1 / n)) ** i).toFixed(3));
            return { year: body.baseYear + i, n: i, targetEmission: t, scope1Target: t * 0.6, scope2Target: t * 0.4, scope3Target: null, reducedBy: null, reducedByPct: null };
          }),
          actualVsTarget: [],
        });
      }
      return json({});
    },
  );
  return { targets };
}

test("a manager sets a near-term target and sees it evaluated on one page", async ({ page }) => {
  const { targets } = await signIn(page);
  await page.goto("/targets?base=2024&horizon=5");

  await expect(page.getByRole("heading", { level: 1, name: "Targets" })).toBeVisible();
  await expect.poll(() => targets.length).toBeGreaterThan(0);
  expect(targets[0].body).toEqual({ siteIds: [1, 2], baseYear: 2024, targetYear: 2029, annualRate: 0.042 });

  const kpi = page.locator("dl").first();
  await expect(kpi).toContainText("Base emissions 2024");
  await expect(kpi).toContainText("Target 2029");
  await expect(kpi).toContainText("Not reached");

  const rules = page.getByRole("region", { name: "SBTi rules check" });
  await expect(rules).toContainText("Base year 2024 is 2015 or later");
  await expect(rules).toContainText("Covers all Scope 1+2 emissions");
  await expect(rules).toContainText("Scope 3 is 62%, so a Scope 3 target is required");

  // Base years before 2015 aren't offered.
  const base = page.getByLabel("Base year");
  await expect(base.locator("option").last()).toHaveText("2015");

  // Pathway is live: WB2°C re-asks with 2.5%, and the rules warn.
  await page.getByRole("radio", { name: /WB2°C/ }).click();
  await expect.poll(() => targets[targets.length - 1]?.body.annualRate).toBe(0.025);
  await expect(rules).toContainText("Well-below 2°C pathway");
  await expect(page).toHaveURL(/pathway=wb2c/);

  await page.getByRole("tab", { name: "Actual vs target" }).click();
  const actual = page.getByRole("table", { name: "Actual emissions against the target" });
  await expect(actual).toContainText("Reached");
  await expect(actual).toContainText("Not reached");
  await expect(actual).toContainText("No data");

  // Net-zero switches endpoint and target year.
  await page.getByRole("radio", { name: "Net-zero 2050" }).click();
  await expect.poll(() => targets[targets.length - 1]?.path).toContain("long-term-chart");
  await expect(kpi).toContainText("Target 2050");
  await expect(rules).toContainText("Scope 3 is 20%, below 40%");
});

test("a base year without data suggests years that have it", async ({ page }) => {
  await signIn(page);
  await page.goto("/targets?base=2019");
  await expect(page.getByText("No data for base year 2019")).toBeVisible();
  await page.getByRole("button", { name: "Use 2025" }).click();
  await expect(page).toHaveURL(/base=2025/);
  await expect(page.locator("dl").first()).toContainText("Base emissions 2025");
});

test("the old SBTi link opens the new page", async ({ page }) => {
  await signIn(page);
  await page.goto("/sbti-commitment");
  await expect(page).toHaveURL(/\/targets/);
});
