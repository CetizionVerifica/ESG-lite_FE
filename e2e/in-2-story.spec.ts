import { expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/** IN-2 · Story panels: ESG ring (A), decoupling (B), target wall (H) on mocks. */

test("a click on a ring pillar filters the page through the URL, and 'All pillars' goes back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const ring = page.getByTestId("panel-ring");
  await expect(ring.getByTestId("esg-ring")).toHaveAttribute("data-pillar", "all");
  await expect(ring.getByRole("img")).toHaveAttribute("aria-label", /^ESG data readiness 69% of KPI values approved/);

  // Environment holds 16 of the 40 KPIs: the first 144° clockwise from 12 o'clock. Its middle (72°)
  // sits in the pillar ring, between 26% and 50% of the radius.
  const canvas = ring.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const r = (Math.min(box.width, box.height) / 2) * 0.38;
  const a = (72 * Math.PI) / 180;
  await canvas.click({ position: { x: box.width / 2 + r * Math.sin(a), y: box.height / 2 - r * Math.cos(a) } });
  await expect(page).toHaveURL(/pillar=environment/);
  await expect(ring.getByTestId("esg-ring")).toHaveAttribute("data-pillar", "environment");
  await expect(ring.getByRole("img")).toHaveAttribute("aria-label", /^Environment: 81% of KPI values approved/);

  await ring.getByRole("button", { name: "All pillars" }).click();
  await expect(page).not.toHaveURL(/pillar=/);
  await expect(ring.getByTestId("esg-ring")).toHaveAttribute("data-pillar", "all");

  // The header's pillar chips drive the same filter: the ring opens zoomed.
  await page.getByRole("button", { name: "Social" }).first().click();
  await expect(page).toHaveURL(/pillar=social/);
  await expect(ring.getByTestId("esg-ring")).toHaveAttribute("data-pillar", "social");
});

test("a target wall row opens its target; a pillar letter filters the page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const wall = page.getByTestId("panel-wall");
  await expect(wall.getByRole("img")).toHaveAttribute("aria-label", /^3 targets, worst first\./);

  const list = wall.getByRole("list", { name: "Targets" });
  await list.getByRole("button", { name: "Show Social only" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/pillar=social/);

  await list.getByRole("link", { name: "Scope 1 and 2 emissions (SBTi near term)" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/targets$/);
});

test("the decoupling panel opens its table view from the header", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const panel = page.getByTestId("panel-decoupling");
  await expect(panel.getByRole("img")).toHaveAttribute("aria-label", "Since 2021, output is up 42%, emissions down 19% and intensity down 43% (indexed, 2021 = 100).");
  await panel.getByTestId("panel-header").focus();
  await page.keyboard.press("Enter");
  const table = panel.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row").nth(1)).toContainText("2021 (base)");
  await expect(table.getByRole("row").last()).toContainText("66,880");
  await expect(table.getByRole("columnheader", { name: "Emissions (tCO₂e)" })).toBeVisible();
});

test("without KPI tracking the ring is hidden and the wall shows the SBTi target only; 390 px has no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights");
  const wall = page.getByTestId("panel-wall");
  await expect(wall.getByRole("img")).toHaveAttribute("aria-label", /^1 target, worst first\./);
  await expect(page.getByTestId("panel-decoupling").getByTestId("decoupling")).toBeVisible();
  await expect(page.getByTestId("panel-ring")).toHaveCount(0);
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});

test("at 390 px with KPI tracking the three story panels fit the width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights");
  await expect(page.getByTestId("panel-ring").getByTestId("esg-ring")).toBeVisible();
  await expect(page.getByTestId("panel-wall").getByTestId("target-wall")).toBeVisible();
  await expect(page.getByTestId("panel-decoupling").getByTestId("decoupling")).toBeVisible();
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});
