import { expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/** IN-3 · Insight cards on mocks: Show scrolls to and pulses its panel; Open navigates; 390 px. */

test("a card's Show scrolls to and pulses its panel, and Open follows the server's link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const cards = page.getByTestId("insight-cards");
  await expect(cards.getByTestId("insight-card")).toHaveCount(6);
  const gap = cards.locator('[data-rule="pathway_gap"]');
  await expect(gap.getByRole("heading", { level: 3 })).toHaveText("Emissions are 3.4% above the 2030 pathway.");
  await expect(gap.getByTestId("severity-chip")).toHaveText("Critical");

  // Three a row at 1280.
  const first = await cards.getByTestId("insight-card").nth(0).boundingBox();
  const third = await cards.getByTestId("insight-card").nth(2).boundingBox();
  expect(Math.abs(third!.y - first!.y)).toBeLessThan(2);

  await gap.scrollIntoViewIfNeeded();
  const pathway = page.getByTestId("panel-pathway");
  await expect(pathway).not.toHaveClass(/ring-2/);
  await gap.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/panel=pathway/);
  await expect(pathway).toHaveClass(/ring-2/);
  await expect(pathway).toBeInViewport();

  await page.getByTestId("insight-cards").locator('[data-rule="largest_source"]').getByRole("link", { name: /Open/ }).click();
  await expect(page).toHaveURL(/\/data\/ledger\?status=approved/);
});

test("at 390 px the cards stack in one column without overflow, and without KPI tracking there's no KPI card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights");
  const cards = page.getByTestId("insight-cards").getByTestId("insight-card");
  await expect(cards).toHaveCount(5);
  await expect(page.locator('[data-rule="target_off_track"]')).toHaveCount(0);
  const a = await cards.nth(0).boundingBox();
  const b = await cards.nth(1).boundingBox();
  expect(Math.abs(a!.x - b!.x)).toBeLessThan(2);
  expect(b!.y).toBeGreaterThan(a!.y + a!.height - 2);
  expect(await overflowX(page)).toBeLessThanOrEqual(1);

  const decoupling = page.getByTestId("insight-cards").locator('[data-rule="decoupling"]');
  await decoupling.scrollIntoViewIfNeeded();
  await decoupling.getByRole("button", { name: "Show" }).click();
  await expect(page.getByTestId("panel-decoupling")).toHaveClass(/ring-2/);
  await expect(page.getByTestId("panel-decoupling")).toBeInViewport();
});
