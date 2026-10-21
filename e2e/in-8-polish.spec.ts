import { expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/** IN-8 · Motion, stripes, present mode and export, on mocks. */

test("the stripes band summarises the months in words and reads a month on hover", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const band = page.getByTestId("stripes").getByRole("img");
  await expect(band).toHaveAttribute("aria-label", "Monthly emissions from Jan 2021 to Sep 2026: 4,300 tCO₂e in the first month and 3,280 tCO₂e in the last; darker is higher.");
  await expect(page.getByTestId("stripes").locator("[data-month]")).toHaveCount(69);
  await page.getByTestId("stripes").locator('[data-month="2021-01"]').hover();
  await expect(page.getByTestId("stripes-readout")).toHaveText("Jan 2021: 4,300 tCO₂e");
});

test("under reduced motion the hero shows its final figures at once and nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const value = page.getByTestId("hero-net-value");
  await value.waitFor();
  // The very first text is the server's value (no count-up from 0).
  expect(await value.textContent()).toBe("41,280");
  const animations = await page.evaluate(() => document.getAnimations().length);
  expect(animations).toBe(0);
});

test("with motion, the hero counts up and lands on the server's value", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  await expect(page.getByTestId("hero-net-value")).toHaveText("41,280");
});

test("present mode: same filters, arrow keys move through the slides, Esc goes back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2025&compare=base");
  await page.getByRole("button", { name: "Present" }).click();
  await expect(page).toHaveURL(/\/insights\/present\?year=2025&compare=base$/);
  const deck = page.getByRole("dialog", { name: "Present insights" });
  await expect(deck.getByTestId("slide-counter")).toHaveText("1 / 6");
  await expect(deck.getByTestId("slide-title")).toHaveText("Our year in one view");
  await expect(deck.getByTestId("hero-strip")).toBeVisible();
  await expect(deck.getByTestId("stripes")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(deck.getByTestId("slide-counter")).toHaveText("2 / 6");
  await expect(deck.getByTestId("panel-decoupling")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(deck.getByTestId("slide-title")).toHaveText("Pathway and what moved");
  await deck.getByRole("radio", { name: "What moved" }).click();
  await expect(deck.getByTestId("pathway-story")).toHaveAttribute("data-mode", "bridge");
  // Arrow keys inside the toggle belong to the toggle; leave it before moving on.
  await deck.getByTestId("slide-title").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(deck.getByTestId("slide-counter")).toHaveText("6 / 6");
  await expect(deck.getByTestId("insight-card")).toHaveCount(3);
  await page.keyboard.press("ArrowRight");
  await expect(deck.getByTestId("slide-counter")).toHaveText("6 / 6");
  await page.keyboard.press("ArrowLeft");
  await expect(deck.getByTestId("slide-counter")).toHaveText("5 / 6");

  // Focus stays inside the deck.
  for (let i = 0; i < 12; i += 1) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="insights-present"]'))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/insights\?year=2025&compare=base$/);
  await expect(page.getByTestId("insights-page")).toBeVisible();
});

test("present mode without KPI tracking has no ESG ring slide, and fits 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights/present");
  await expect(page.getByTestId("slide-counter")).toHaveText("1 / 5");
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});

test("Export: the PDF snapshot downloads for the filters, and PNG of each chart downloads the charts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026&sites=11");
  await expect(page.getByTestId("panel-decoupling")).toHaveAttribute("data-state", "ok");

  await page.getByTestId("insights-export").click();
  const pdf = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "PDF snapshot" }).click();
  const file = await pdf;
  expect(file.suggestedFilename()).toBe("insights-CY-2026-sites-11.pdf");
  expect(calls.some((c) => c.path.includes("/insights/snapshot.pdf") && c.path.includes("sites=11"))).toBe(true);
  await expect(page.getByText("PDF snapshot downloaded.")).toBeVisible();

  const pngs: string[] = [];
  page.on("download", (d) => pngs.push(d.suggestedFilename()));
  await page.getByTestId("insights-export").click();
  await page.getByRole("menuitem", { name: "PNG of each chart" }).click();
  await expect.poll(() => pngs.length).toBeGreaterThanOrEqual(3);
  expect(pngs.every((n) => n.endsWith(".png"))).toBe(true);
});

test("the print route draws the page without app chrome and with the footer", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights/print?year=2026");
  const sheet = page.getByTestId("insights-print");
  await expect(sheet.getByTestId("hero-strip")).toBeVisible();
  await expect(sheet.getByTestId("insight-card")).toHaveCount(3);
  await expect(sheet.getByTestId("print-footer")).toContainText("from approved data");
  await expect(sheet.locator("svg").first()).toBeVisible();
});
