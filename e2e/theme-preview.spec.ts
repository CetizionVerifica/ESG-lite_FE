import { expect, test } from "@playwright/test";

test("theme preview shows the four reference themes and they all pass contrast", async ({ page }) => {
  await page.goto("/dev/theme");

  await expect(page.getByRole("heading", { name: "Theme tokens" })).toBeVisible();
  for (const id of ["pp", "midal-classic", "midal-light", "midal-night"]) {
    const card = page.getByTestId(`theme-${id}`);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("contrast-result")).toContainText("pass AA");
  }

  // Tokens reach Tailwind classes: Midal Classic's top bar is the navy primary.
  const bar = page.getByTestId("theme-midal-classic").locator("header");
  await expect(bar).toHaveCSS("background-color", "rgb(11, 46, 92)");
});
