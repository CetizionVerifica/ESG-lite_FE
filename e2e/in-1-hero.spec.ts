import { expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/** IN-1 · The hero strip and the pending banner on mocks. */

test("the hero shows net, intensity, readiness and needs-you; the menu and the banner are doors", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const hero = page.getByTestId("hero-strip");
  await expect(hero.getByTestId("hero-net-value")).toHaveText("41,280");
  await expect(hero.getByTestId("hero-net").getByTestId("change-chip")).toHaveText("down 8.1% on 2025");
  await expect(hero.getByTestId("hero-net").getByTestId("status-chip")).toHaveText("At risk");
  await expect(hero.getByTestId("hero-readiness-value")).toHaveText("69%");
  await expect(page.getByTestId("pending-banner")).toContainText("12 entries and 3 KPI values waiting for approval aren't in these figures.");

  await page.getByTestId("hero-attention-trigger").click();
  await page.getByRole("menuitem", { name: /Targets off track · 3/ }).click();
  await expect(page).toHaveURL(/\/kpi\/targets$/);

  await page.goto("/insights?year=2026");
  await page.getByTestId("pending-banner").getByRole("link", { name: "Review →" }).click();
  await expect(page).toHaveURL(/\/data\/approvals/);
});

test("without KPI tracking the hero shows renewable share, and at 390 px the cells stack without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights");
  await expect(page.getByTestId("hero-renewables")).toContainText("47%");
  await expect(page.getByTestId("hero-readiness")).toHaveCount(0);
  await expect(page.getByTestId("pending-banner")).toContainText("12 entries waiting for approval aren't in these figures.");
  const net = await page.getByTestId("hero-net").boundingBox();
  const intensity = await page.getByTestId("hero-intensity").boundingBox();
  expect(intensity!.y).toBeGreaterThan(net!.y + net!.height - 2);
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});
