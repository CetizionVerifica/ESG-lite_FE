import { expect, test, type Page } from "@playwright/test";

// Midal Classic joins once F1's buildTheme can apply a client pack to the demo.
const THEMES = ["light", "dark"] as const;
const SECTIONS = ["format", "button", "status-pill", "fields", "empty-state", "skeleton"];

async function openGallery(page: Page, theme: string) {
  await page.goto(`/__ui?theme=${theme}`);
  await page.waitForSelector("[data-demo=fields]");
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
  });
}
