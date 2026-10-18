import { expect, test } from "@playwright/test";
import { MIA, kpiApp } from "./kpiMockApi";

/**
 * KPI-10 (wave D) · The Overview's KPI tiles: "KPI readiness" per enabled
 * framework and "KPIs due this month" from `GET /kpi/overview`, linking to
 * the dashboard and My KPIs; nothing while the switch is off.
 */

const totals = { gross: 10, net: 10, saved: 0, scope_1: 5, scope_2: 5, scope_3: 0, entries: 2, approved_count: 2, pending_count: 0, rejected_count: 0, pending_emission: 0, net_vs_last_year_pct: null };
const emissions = (url: URL) => {
  const path = url.pathname;
  if (path.endsWith("/manager/overview"))
    return { period: { key: "2026-09" }, site_ids: [1, 2, 3], category_id: null, kpis: totals, by_scope: [], by_site: [], by_month: [], yearly_total: 0, by_category: [], submission: { month: "2026-09", submitted: 0, missing: 0, users: [] }, trend: [], last_year: null };
  if (path.endsWith("/manager/submission-status")) return { users: [] };
  if (path.endsWith("/user/emissions")) return { data: [], total: 0, summary: { total_emission: 0, pending_count: 0, approved_count: 0, rejected_count: 0 } };
  if (path.endsWith("/user/production-data/manager")) return [];
  return undefined;
};

test("a manager sees KPI readiness per framework and what's due, with links onward", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA, other: emissions });
  await page.goto("/overview");
  const readiness = page.getByTestId("kpi-readiness-tile");
  await expect(readiness.getByRole("heading", { name: "KPI readiness" })).toBeVisible();
  await expect(readiness.getByRole("progressbar", { name: "GRI readiness" })).toHaveAttribute("aria-valuenow", "82");
  await expect(readiness).toContainText("BRSR");
  await expect(readiness).toContainText("74 %");
  await expect(readiness).toContainText("68 %");

  const due = page.getByTestId("kpi-due-tile");
  await expect(due.getByRole("heading", { name: "KPIs due this month" })).toBeVisible();
  await expect(due).toContainText("September 2026");
  await expect(due).toContainText("4 due");
  await expect(due).toContainText("1 sent back · 3 done");

  await readiness.getByRole("link", { name: "Open KPI dashboard" }).click();
  await expect(page).toHaveURL(/\/kpi\/dashboard$/);
  await page.goBack();
  await page.getByTestId("kpi-due-tile").getByRole("link", { name: "Open My KPIs" }).click();
  await expect(page).toHaveURL(/\/kpi\?period=2026-09$/);
});

test("with the switch off the Overview has no KPI tiles", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA, enabled: false, other: emissions });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("kpi-overview-tiles")).toHaveCount(0);
});
