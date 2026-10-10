import { chromium, type FullConfig } from "@playwright/test";

/**
 * Global setup: open /login once on every dev server before the tests start.
 * A cold Vite server transforms the app and pre-bundles its dependencies on the
 * first page load (and may reload the page when it finds new ones), which can
 * take longer than an assertion timeout; the first test of a run used to fail
 * on it (audit F-25).
 */
export default async function warmup(config: FullConfig): Promise<void> {
  const origins = [...new Set(config.projects.map((p) => p.use.baseURL).filter((u): u is string => !!u))];
  const browser = await chromium.launch();
  try {
    for (const origin of origins) {
      const page = await browser.newPage();
      // Twice: the second load runs on the optimised dependencies.
      for (let i = 0; i < 2; i++) {
        await page.goto(`${origin}/login`, { waitUntil: "load", timeout: 120_000 });
        await page.locator("#root > *").first().waitFor({ state: "attached", timeout: 120_000 });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
