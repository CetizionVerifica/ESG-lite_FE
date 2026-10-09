import { expect, test, type Page } from "@playwright/test";

// PlanetPulse light, PlanetPulse dark and Midal Classic (F1 buildTheme).
const THEMES = ["light", "dark", "classic"] as const;
const SECTIONS = ["page-header", "filter-bar", "data-table", "kpi-strip", "chart-frame", "callout", "primitives", "flows", "format", "button", "status-pill", "fields", "empty-state", "skeleton"];

async function openGallery(page: Page, theme: string) {
  await page.goto(`/__ui?theme=${theme}`);
  await page.waitForSelector("[data-demo=chart-frame] canvas");
  await page.evaluate(() => document.fonts.ready);
}

for (const theme of THEMES) {
  test.describe(theme, () => {
    test("component sections", async ({ page }) => {
      await openGallery(page, theme);
      for (const id of SECTIONS) {
        await expect(page.locator(`[data-demo="${id}"]`)).toHaveScreenshot(`${id}-${theme}.png`);
      }
    });

    test("modal and drawer", async ({ page }) => {
      await openGallery(page, theme);
      await page.getByRole("button", { name: "Destructive modal" }).click();
      await expect(page.getByRole("alertdialog")).toHaveScreenshot(`modal-destructive-${theme}.png`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Short form modal" }).click();
      await expect(page.getByRole("dialog")).toHaveScreenshot(`modal-form-${theme}.png`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Drawer", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveScreenshot(`drawer-${theme}.png`);
    });

    test("document viewer and command palette", async ({ page }) => {
      await openGallery(page, theme);
      await page.getByRole("button", { name: "Open document viewer" }).click();
      await expect(page.getByRole("dialog", { name: "bewa-sep-2025.svg" })).toHaveScreenshot(`document-viewer-${theme}.png`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Open command palette" }).click();
      await page.keyboard.type("hi");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveScreenshot(`command-palette-${theme}.png`);
    });

    test("period editor", async ({ page }) => {
      await openGallery(page, theme);
      await page.getByRole("button", { name: /Period:/ }).click();
      await expect(page.getByRole("dialog", { name: "Choose period" })).toHaveScreenshot(`period-editor-${theme}.png`);
    });

    test("data table at 390px", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await openGallery(page, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await expect(page.locator('[data-demo="data-table"]')).toHaveScreenshot(`data-table-390-${theme}.png`);
    });
  });
}
