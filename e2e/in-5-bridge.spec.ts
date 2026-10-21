import { expect, test, type Page } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/**
 * IN-5 · The emissions bridge (D) on mocks. It lives in the pathway slot
 * behind the "Pathway | What moved" toggle and draws in the same chart, so the
 * bars morph between the two views.
 */

async function openBridge(page: Page) {
  await page.goto("/insights?year=2026&panel=bridge");
  const slot = page.getByTestId("panel-pathway");
  // ?panel=bridge opens on What moved; the toggle says so.
  await expect(slot.getByRole("radio", { name: "What moved" })).toHaveAttribute("aria-checked", "true");
  await expect(slot.getByTestId("pathway-story")).toHaveAttribute("data-mode", "bridge");
  return slot;
}

test("What moved shows the waterfall with signed changes, a table view and the calculation drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  const bridge = await openBridge(page);
  await expect(bridge.getByRole("img")).toHaveAttribute("aria-label", /^Emissions went from 44,910 tCO₂e in 2025 to 41,280 tCO₂e in 2026; the biggest driver was cleaner electricity/);
  await expect(bridge.getByRole("list", { name: "Bar colours" })).toContainText("Increase (+)");

  await bridge.getByRole("radio", { name: "Table" }).click();
  const table = bridge.getByRole("table", { name: "What moved" });
  await expect(table.getByRole("row", { name: /More output/ })).toContainText("+2,331");
  await expect(table.getByRole("row", { name: /Cleaner electricity/ })).toContainText("Decrease");

  await bridge.getByRole("button", { name: "How this is calculated" }).click();
  const drawer = page.getByRole("dialog", { name: "How this is calculated" });
  await expect(drawer).toContainText("L(Eᵀ, E⁰) × ln(driverᵀ / driver⁰)");
  await expect(drawer.getByTestId("calc-step-activity")).toContainText("Output (2025)");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("toggling back to Pathway and forth keeps the bridge", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  const slot = await openBridge(page);
  // One chart for both views: the canvas stays while the bars morph.
  await expect(slot.locator("canvas")).toHaveCount(1);
  await slot.getByRole("radio", { name: "Pathway" }).click();
  await expect(slot.getByTestId("pathway-story")).toHaveAttribute("data-mode", "pathway");
  await expect(slot.getByRole("img")).toHaveAttribute("aria-label", /pathway/i);
  await expect(slot.locator("canvas")).toHaveCount(1);
  await slot.getByRole("radio", { name: "What moved" }).click();
  await expect(slot.getByTestId("pathway-story")).toHaveAttribute("data-mode", "bridge");
});

test("without data the bridge says what's needed", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), {
    insights: true,
    kpi: true,
    panels: { bridge: { availability: "no_data", reason: "Approve emissions for 2025 and 2026 to see what moved." } },
  });
  await page.goto("/insights?year=2026");
  const slot = page.getByTestId("panel-pathway");
  await slot.getByRole("radio", { name: "What moved" }).click();
  await expect(slot.getByTestId("bridge-panel")).toContainText("Approve emissions for 2025 and 2026 to see what moved.");
});

test("at 390 px the bridge and its drawer fit without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  const bridge = await openBridge(page);
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
  await bridge.getByRole("button", { name: "How this is calculated" }).click();
  await expect(page.getByRole("dialog", { name: "How this is calculated" })).toBeVisible();
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});
