import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const parsedBaseUrl = new URL(baseURL);
if (
  parsedBaseUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(parsedBaseUrl.hostname) ||
  parsedBaseUrl.port !== "3000"
) {
  throw new Error(`CL Release 5 E2E refuses non-local base URL: ${baseURL}`);
}

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
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    screenshot: "on",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
