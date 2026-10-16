import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Minimal React component test harness for Phase 4c attachment UI.
 * Distinct from real browser/Supabase E2E (still pending) and from
 * node:test pure helper suites (`test:inbox-attachment-ui`).
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
