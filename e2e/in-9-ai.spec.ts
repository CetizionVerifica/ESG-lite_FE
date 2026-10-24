import { expect, test } from "@playwright/test";
import { aiCardsData } from "../src/test/msw/insightsData";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/**
 * IN-9 · "Natural wording" on the insight cards (on mocks). Needs IN-3's
 * InsightCards with the IN-9 pieces integrated (NaturalWordingToggle,
 * CardWording, useCardsPanel).
 */

const RULE_DECOUPLING = "Output is up 42% since 2021 while emissions fell 19%.";
const AI_DECOUPLING = "Since 2021, output grew 42% and emissions dropped 19%.";

test("turning on natural wording asks for ?ai=1, labels AI cards, and 'Show original' shows the rule sentence", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await mockInsightsApi(page, "Manager", { ...managerAt(true, true), user_id: 912 }, { insights: true, kpi: true, aiCards: aiCardsData });
  await page.goto("/insights?year=2026");
  const panel = page.getByTestId("panel-cards");
  await expect(panel).toContainText(RULE_DECOUPLING);
  await expect(panel.locator('[data-source="ai"]')).toHaveCount(0);

  const toggle = panel.getByRole("switch", { name: "Natural wording" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => calls.some((c) => c.path.includes("/insights/cards") && c.path.includes("ai=1"))).toBe(true);

  await expect(panel).toContainText(AI_DECOUPLING);
  // AI cards carry the AI chip (word + icon) next to the sentence.
  await expect(panel.locator('[data-source="ai"]').first()).toContainText("AI");
  // The deliberately invalid AI text never shows: that card keeps its rule sentence.
  await expect(panel).toContainText("Renewable electricity rose from 31% to 47%.");
  await expect(panel).not.toContainText("in 1 year");

  await panel.locator(`[data-rule="decoupling"]`).getByRole("button", { name: "Show original" }).click();
  await expect(panel).toContainText(RULE_DECOUPLING);

  // Remembered for this user.
  await page.reload();
  await expect(page.getByTestId("panel-cards").getByRole("switch", { name: "Natural wording" })).toHaveAttribute("aria-checked", "true");
});

test("at 390 px the cards with natural wording fit without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false, aiCards: aiCardsData });
  await page.goto("/insights");
  const panel = page.getByTestId("panel-cards");
  await panel.getByRole("switch", { name: "Natural wording" }).click();
  await expect(panel).toContainText(AI_DECOUPLING);
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});
