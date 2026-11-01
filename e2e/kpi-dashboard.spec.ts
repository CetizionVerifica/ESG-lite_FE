import { type Page, expect, test } from "@playwright/test";
import { MIA, OMAR, kpiApp } from "./kpiMockApi";

/**
 * KPI-10 · The KPI dashboard (`/kpi/dashboard`, 05-ux S5): rings per
 * framework that filter the gaps, KPI cards with trend and target, Remind
 * and Open on each gap, and "Refresh from your data".
 */

const open = (page: Page, query = "") => page.goto(`/kpi/dashboard${query}`);
const ring = (page: Page, name: string) => page.getByTestId("kpi-ring").filter({ hasText: name });
const gaps = (page: Page) => page.getByTestId("kpi-gap");

test("rings show readiness per framework and filter what's missing", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await expect(page.getByRole("heading", { name: "KPIs", level: 1 })).toBeVisible();
  await expect(page.getByText(/^2026 · all 3 sites · readiness by framework$/)).toBeVisible();
  await expect(ring(page, "GRI")).toContainText("82%");
  await expect(ring(page, "GRI")).toContainText("2 gaps");
  await expect(ring(page, "BRSR")).toContainText("Core 7 of 9 · 2 gaps");
  await expect(ring(page, "ESRS")).toContainText("6 material topics · 3 gaps");
  await expect(ring(page, "GRI")).toHaveAttribute("aria-label", /GRI 82 percent ready: 18 approved, 2 pending, 2 missing of 22 required/);

  await expect(gaps(page)).toHaveCount(4);
  await ring(page, "BRSR").click();
  await expect(ring(page, "BRSR")).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/fw=BRSR/);
  await expect(page.getByTestId("kpi-gaps-filter")).toHaveText("BRSR only");
  await expect(gaps(page)).toHaveCount(3);
  await expect(gaps(page).filter({ hasText: "New hires" })).toHaveCount(0);
  await ring(page, "BRSR").click();
  await expect(page.getByTestId("kpi-gaps-filter")).toHaveText("All frameworks");
  await expect(gaps(page)).toHaveCount(4);
});

test("cards show the year, the change, a trend and the target; pending values are flagged", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await expect(page.getByText("6 values pending review aren't counted yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review them" })).toHaveAttribute("href", "/data/approvals?view=kpi");

  const scope1 = page.getByTestId("kpi-card").filter({ hasText: "Scope 1 emissions" });
  // #209: a tCO₂e figure always shows 3 decimals (the mock's 4650.2 for 2026).
  await expect(scope1.getByTestId("kpi-card-value")).toHaveText("4,650.200 tCO₂e");
  await expect(scope1).toContainText("−7 % vs 2025");
  await expect(scope1).toContainText("From your data");
  await expect(scope1.getByTestId("kpi-target-progress")).toContainText("Target: −40 % by 2030 from 2024");
  await expect(scope1.getByTestId("kpi-target-progress")).toContainText("28.1 % of the way");
  await expect(scope1.getByRole("img", { name: /Scope 1 emissions, 12 periods: from 540\.000 tCO₂e \(Oct 2025\) to 512\.400 tCO₂e \(Sep 2026\)/ })).toBeVisible();
  await expect(scope1).toContainText("Climate");

  // Last year's figures.
  await page.getByLabel("Year").selectOption("2025");
  await expect(page).toHaveURL(/year=2025/);
  await expect(scope1.getByTestId("kpi-card-value")).toHaveText("4,980.400 tCO₂e");
});

test("Remind asks the owner once; Open goes to what's left for the period", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  const matola = gaps(page).filter({ hasText: "Water discharged" });
  await expect(matola).toContainText("Matola · Jul, Sep missing · owed by João Mendes");
  await matola.getByRole("button", { name: "Remind João Mendes about Water discharged at Matola" }).click();
  await expect(page.getByText("Reminder sent to João Mendes")).toBeVisible();
  await expect(matola.getByRole("button", { name: /Remind/ })).toBeDisabled();
  expect(calls.find((c) => c.path.endsWith("/kpi/dashboard/remind"))?.body).toEqual({ kpi: 14, site: 3 });
  await expect(matola.getByRole("link", { name: "Open Water discharged at Matola" })).toHaveAttribute("href", "/data/approvals?view=kpi&step=close&period=2026-09&site=3");
});

test("Refresh from your data reads the auto values again", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Admin", user: OMAR });
  await open(page);
  await page.getByRole("button", { name: "Refresh from your data" }).click();
  await expect(page.getByText("4 values updated from your data")).toBeVisible();
  expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/kpi/auto/refresh"))).toBe(true);
  // An Admin can't approve, so no review link and no Open on gaps.
  await expect(page.getByRole("link", { name: "Review them" })).toHaveCount(0);
  await expect(gaps(page).first().getByRole("link", { name: /Open/ })).toHaveCount(0);
});

test("at 390 px the dashboard doesn't scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await expect(ring(page, "GRI")).toBeVisible();
  await expect(page.getByTestId("kpi-card").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("with the switch off /kpi/dashboard is not available", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA, enabled: false });
  await open(page);
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("kpi-ring")).toHaveCount(0);
});
