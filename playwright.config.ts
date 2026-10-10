import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
// Second dev server with the redesign switched on, for *.newui.spec.ts.
const NEW_UI_PORT = 4174;
const UI_SNAPSHOTS = "ui/**";

export default defineConfig({
  testDir: "./e2e",
  // Loads the app once per dev server so the first test doesn't meet a cold Vite.
  globalSetup: "./e2e/warmup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // e2e/ui holds the opt-in visual snapshots (playwright.ui.config.ts). A
  // project-level testIgnore replaces the top-level one, so each project
  // lists it.
  projects: [
    { name: "chromium", testIgnore: [UI_SNAPSHOTS, /\.newui\.spec\.ts$/], use: { ...devices["Desktop Chrome"] } },
    {
      name: "new-ui",
      testMatch: /\.newui\.spec\.ts$/,
      testIgnore: UI_SNAPSHOTS,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${NEW_UI_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev -- --port ${NEW_UI_PORT} --strictPort`,
      url: `http://localhost:${NEW_UI_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      env: { VITE_NEW_UI: "1" },
    },
  ],
});
