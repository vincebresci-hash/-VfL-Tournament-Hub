import { defineConfig, devices } from "@playwright/test";

/**
 * CL Release 5 admin schedule E2E. LOCAL ONLY.
 *
 * Expects the app on http://localhost:3000 backed by a local `supabase start`
 * stack seeded with e2e/seed/cl-release-5-synthetic.sql. Never point this at a
 * hosted/production URL.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
