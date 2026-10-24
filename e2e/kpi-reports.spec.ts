import { type Page, expect, test } from "@playwright/test";
import { MIA, OMAR, kpiApp } from "./kpiMockApi";

/**
 * KPI-11 · Framework reports (`/reports/kpi/:framework`, 05-ux S6): a tab
 * per framework with the year's approved values in its own units, what's
 * left out and why, the pending banner, every value tracing to its records,
 * and the downloads (XLSX for all, PDF for the GRI content index).
 */

const open = (page: Page, fw = "GRI", query = "") => page.goto(`/reports/kpi/${fw}${query}`);
const row = (page: Page, code: string) => page.getByTestId("kpi-report-row").filter({ has: page.getByRole("rowheader", { name: code, exact: true }) });
const omission = (page: Page, code: string) => page.getByTestId("kpi-report-omission").filter({ has: page.getByRole("rowheader", { name: code, exact: true }) });

test("the GRI content index: values in GRI's units, omissions with reasons, the pending banner", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await expect(page.getByRole("heading", { name: "Framework reports", level: 1 })).toBeVisible();
  await expect(page.getByText(/^2026 · all sites · approved values only$/)).toBeVisible();
  await expect(page.getByRole("tab", { name: "GRI content index" })).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "302-1")).toContainText("14,832 GJ");
  await expect(row(page, "303-3")).toContainText("3.63 ML");
  await expect(row(page, "305-1")).toContainText("512.4 tCO₂e");
  await expect(omission(page, "2-25")).toContainText("Not tracked in ESGLite");
  await expect(omission(page, "305-3")).toContainText("No approved value for 2026 yet.");

  await expect(page.getByText("6 values are pending review and aren't in this report yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "See them" })).toHaveAttribute("href", "/data/approvals?view=kpi");
});

test("a value traces back to its records, read-only", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await row(page, "303-3").getByRole("button", { name: /3\.63 ML/ }).click();
  const list = page.getByRole("dialog", { name: "303-3 · Water taken in" });
  await expect(list.getByRole("list", { name: "Values behind this figure" }).getByRole("listitem")).toHaveCount(3);
  await list.getByRole("button", { name: "Open Water withdrawn, Dammam, August 2026" }).click();
  const drawer = page.getByRole("dialog", { name: "Water withdrawn" });
  await expect(drawer.getByTestId("kpi-review-value")).toHaveText("1,210 m³");
  await expect(drawer.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "303-3 · Water taken in" })).toBeVisible();
});

test("downloads: XLSX and the GRI PDF; BRSR has XLSX only", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download XLSX" }).click()]);
  expect(xlsx.suggestedFilename()).toBe("GRI-2026.xlsx");
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^GRI-2026.*\.pdf$/);

  await page.getByRole("tab", { name: "BRSR" }).click();
  await expect(page).toHaveURL(/\/reports\/kpi\/BRSR/);
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  const [brsr] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download XLSX" }).click()]);
  expect(brsr.suggestedFilename()).toBe("BRSR-2026.xlsx");
});

test("BRSR shows this year and last with the Core marker; ESRS lists topics that aren't material", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR });
  await open(page, "BRSR");
  const table = page.getByTestId("kpi-report-table");
  await expect(table.getByRole("columnheader", { name: "2026" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "2025" })).toBeVisible();
  await expect(row(page, "P6-E1")).toContainText("14,832 GJ");
  await expect(row(page, "P6-E1")).toContainText("15,498 GJ");
  await expect(row(page, "P6-E1")).toContainText("Core");
  // An Admin isn't sent to Approvals.
  await expect(page.getByRole("link", { name: "See them" })).toHaveCount(0);

  await page.getByRole("tab", { name: "ESRS" }).click();
  await expect(row(page, "E1-5")).toContainText("4,120 MWh");
  await expect(omission(page, "E4")).toContainText("Not material: No site is in or next to a protected area.");
  await expect(omission(page, "E4")).toContainText("E4 Biodiversity and ecosystems");
});

test("an unknown framework goes to the first one the company reports", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page, "XYZ", "?year=2026");
  await expect(page).toHaveURL(/\/reports\/kpi\/GRI\?year=2026/);
  await expect(page.getByRole("tab", { name: "GRI content index" })).toHaveAttribute("aria-selected", "true");
});

test("at 390 px the report scrolls inside its table, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await expect(row(page, "302-1")).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("with the switch off framework reports are not available", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA, enabled: false });
  await open(page);
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("kpi-report-table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Download XLSX" })).toHaveCount(0);
});
