import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * DS-14F · the Design Studio main path against the real backend (e2e/ds-14-main-path.spec.ts).
 *
 *   1. ESG-lite:    npm run build && DB_NAME=ci_<x> node ci/golden/ds/e2e-stack.cjs /tmp/ds-stack.json 3995 http://localhost:4317
 *   2. ESG-lite_FE: DS_E2E_STACK=/tmp/ds-stack.json npx playwright test --config playwright.ds-real.config.ts
 *
 * The app's dev server gets VITE_API_URL from the stack file, on its own port (4317), so it
 * never shares a server with the mocked specs on 4173.
 */
const PORT = Number(process.env.DS_E2E_APP_PORT ?? 4317);
const stackFile = process.env.DS_E2E_STACK;
const api = stackFile ? (JSON.parse(readFileSync(stackFile, "utf8")) as { api: string }).api : "http://127.0.0.1:3995";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /ds-14-main-path\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true, // 4317 is this config's own port; a server already there must point at the same stack
    env: { VITE_API_URL: api },
    timeout: 300_000,
  },
});
