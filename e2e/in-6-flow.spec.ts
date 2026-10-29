import { expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/** IN-6 · The data-to-disclosure flow (Sankey) on mocks. */

test("the Data flow tab draws the sankey and its table lists every link with measure and fit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  await page.getByRole("tab", { name: "Data flow" }).click();
  const panel = page.getByTestId("panel-flow");
  const flow = panel.getByTestId("disclosure-flow");
  await expect(flow.getByRole("img")).toHaveAttribute("aria-label", "3 sites feed Scope 1, 2 and 3; 3 KPIs feed 3 disclosures.");
  await expect(flow.locator("canvas").first()).toBeVisible();
  await expect(flow.getByTestId("flow-legend-count")).toContainText("Count of disclosures each KPI feeds");
  await expect(flow.getByTestId("flow-show-diagram")).toHaveCount(0);

  await flow.getByRole("radio", { name: "Table" }).click();
  const table = flow.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["From", "To", "Value", "Measure", "Fit"]);
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(15);
  await expect(rows.first()).toHaveText(/Chennai plant\s*Scope 1\s*6,100\.000\s*tCO₂e/);
  await expect(rows.last()).toHaveText(/Gross Scope 3\s*ESRS E1-6\s*1\s*Count\s*Derived/);
});

test("without KPI tracking the flow has no disclosure column and no count legend", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights?year=2026");
  await page.getByRole("tab", { name: "Data flow" }).click();
  const flow = page.getByTestId("disclosure-flow");
  await expect(flow.getByRole("img")).toHaveAttribute("aria-label", "3 sites feed Scope 1, 2 and 3; the scopes split into 3 categories.");
  await expect(flow.getByTestId("flow-legend-count")).toHaveCount(0);
  await flow.getByRole("radio", { name: "Table" }).click();
  const table = flow.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveText(["From", "To", "Value", "Measure"]);
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table).not.toContainText("GRI 305-1");
  await expect(table).not.toContainText("Count");
});

test("at 390 px the flow opens as its table with a 'Show diagram' button, without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const flow = page.getByTestId("disclosure-flow");
  await expect(flow.getByRole("table")).toBeVisible();
  await expect(flow.locator("tbody tr")).toHaveCount(15);
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
  await flow.getByTestId("flow-show-diagram").click();
  await expect(flow.locator("canvas").first()).toBeVisible();
  await expect(flow.getByRole("table")).toHaveCount(0);
});
