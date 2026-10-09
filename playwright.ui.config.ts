import { defineConfig, devices } from "@playwright/test";

/**
 * Visual snapshots of the dev-only /__ui gallery (src/ui), one per component
 * section and theme. Opt-in, not part of CI: screenshots depend on the OS and
 * its font rendering. Run `npm run test:ui-snapshots`; after an intended visual
 * change, `npm run test:ui-snapshots -- --update-snapshots` and review the PNGs.
 */
const PORT = 4174;

export default defineConfig({
  testDir: "./e2e/ui",
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  reporter: [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/__ui`,
    reuseExistingServer: !process.env.CI,
  },
});
