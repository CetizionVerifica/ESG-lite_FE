import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const UI_SNAPSHOTS = "ui/**";

export default defineConfig({
  testDir: "./e2e",
  // Loads the app once so the first test doesn't meet a cold Vite.
  globalSetup: "./e2e/warmup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // e2e/ui holds the opt-in visual snapshots (playwright.ui.config.ts).
  projects: [{ name: "chromium", testIgnore: UI_SNAPSHOTS, use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
  },
});
