import { expect, test } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");

  // Generous on the first render: the dev server may still be compiling.
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('input[type="email"]').first()).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("signed-out screens get the PlanetPulse theme on <html>", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-pack", "planetpulse");
  await expect(html).toHaveAttribute("data-look", "light");
  const brand = await html.evaluate((el) => el.style.getPropertyValue("--t-brand"));
  expect(brand).toBe("#2572c0");
});

test("dark OS appearance switches to the Night look without a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await page.emulateMedia({ colorScheme: "dark" });

  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-look", "night");
  await expect(html).toHaveClass(/dark/);
});
