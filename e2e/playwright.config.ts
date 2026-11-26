import { defineConfig, devices } from "@playwright/test";

/**
 * CL Release 5 admin schedule E2E. LOCAL ONLY.
 *
 * Expects the app on http://localhost:3000 backed by a local `supabase start`
 * stack seeded by e2e/seed/ci-seed.mjs (synthetic data). Never point this at a
 * hosted/production URL. Report + results land under e2e/ (config-relative).
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
