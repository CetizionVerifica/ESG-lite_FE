import { expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/** IN-7 · Materiality × performance (05-ux §4 F) on mocks. */

test("the Materiality tab loads when opened; the matrix has a table view and topic links", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  await expect(page.getByTestId("panel-hero")).toHaveAttribute("data-state", "ok");
  expect(calls.some((c) => c.path.includes("/insights/materiality"))).toBe(false);

  await page.getByRole("tab", { name: "Materiality" }).click();
  const panel = page.getByTestId("panel-materiality");
  await expect(panel).toHaveAttribute("data-state", "ok");
  await expect(panel.getByRole("img", { name: "4 material topics; none off track in the act-here corner, 1 at risk: Climate." })).toBeVisible();
  await expect(panel.locator("canvas").first()).toBeVisible();

  // Enter on the panel header opens the table view.
  await panel.getByTestId("panel-header").focus();
  await page.keyboard.press("Enter");
  const rows = panel.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(1)).toContainText("Climate");
  await expect(rows.nth(1)).toContainText("At risk");
  await expect(rows.nth(3)).toContainText("Own workforce");
  await expect(rows.nth(3)).toContainText("Off track");

  // The bubbles' drill-down: each topic opens its KPIs.
  await panel.getByRole("navigation", { name: "Open a topic's KPIs" }).getByRole("link", { name: /Climate · at risk/ }).click();
  await expect(page).toHaveURL(/\/kpi\/esg\?topic=climate$/);
});

test("without scores an Admin sees the topics with status and 'Add scores'; a Manager doesn't get the link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Admin", managerAt(true, true), { insights: true, kpi: true, scored: false });
  await page.goto("/insights?panel=materiality");
  const panel = page.getByTestId("panel-materiality");
  await expect(panel.getByTestId("materiality-topic")).toHaveCount(4);
  await expect(panel.getByTestId("materiality-topic").first().getByTestId("status-chip")).toHaveText("At risk");
  await expect(panel.getByTestId("materiality-topic").first()).toContainText("6 KPIs · 3 on track · 1 off track");
  await panel.getByRole("link", { name: "Add scores" }).click();
  await expect(page).toHaveURL(/\/kpi\/setup\?step=topics$/);
});

test("a Manager sees the unscored list without the 'Add scores' link", async ({ page }) => {
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true, scored: false });
  await page.goto("/insights?panel=materiality");
  const panel = page.getByTestId("panel-materiality");
  await expect(panel.getByTestId("materiality-topic")).toHaveCount(4);
  await expect(panel.getByRole("link", { name: "Add scores" })).toHaveCount(0);
});

test("KPI tracking off: no Materiality tab and no materiality panel", async ({ page }) => {
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights?panel=materiality");
  await expect(page.getByTestId("panel-decoupling")).toHaveAttribute("data-state", "ok");
  await expect(page.getByRole("tab", { name: "Materiality" })).toHaveCount(0);
  await expect(page.getByTestId("panel-materiality")).toHaveCount(0);
});

test("at 390 px the matrix opens from the select and fits without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights");
  await page.getByRole("combobox", { name: "More detail" }).selectOption({ label: "Materiality" });
  const panel = page.getByTestId("panel-materiality");
  await expect(panel).toHaveAttribute("data-state", "ok");
  await expect(panel.getByTestId("materiality-matrix")).toBeVisible();
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});
