import { expect, test, type Page } from "@playwright/test";

/**
 * CL Release 6 — render REAL PDFs for the three reference layouts from seeded,
 * already-applied synthetic tournaments (see e2e/seed/ci-seed-r6-pdf.mjs).
 * LOCAL ONLY. page.pdf() runs in headless Chromium (desktop project); the mobile
 * project captures screenshots of the same pages.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.invalid";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "change-me";

const SCENARIOS: Array<{ slug: string; label: string }> = [
  { slug: "cl6-pdf-cl-single", label: "layout-a-cl-single" },
  { slug: "cl6-pdf-cl-multi", label: "layout-b-cl-multi" },
  { slug: "cl6-pdf-groups", label: "layout-c-groups" },
];

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel(/e-?mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden|login/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"), { timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

for (const { slug, label } of SCENARIOS) {
  test(`saved PDF renders for ${label}`, async ({ page }, info) => {
    await page.goto(`/admin/turniere/${slug}/spielplan/pdf`);
    await expect(page.getByText(/Teilnehmer \(/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Spielplan|Ligaphase/).first()).toBeVisible();
    if (info.project.name === "desktop-chromium" && typeof page.pdf === "function") {
      await page.pdf({ path: `e2e/pdf/${label}-gespeichert.pdf`, format: "A4", printBackground: true });
    }
    await page.screenshot({ path: `e2e/screenshots/${info.project.name}-pdf-${label}.png`, fullPage: true });
  });

  test(`draft PDF is marked ENTWURF for ${label}`, async ({ page }, info) => {
    await page.goto(`/admin/turniere/${slug}/spielplan/pdf?quelle=entwurf`);
    await expect(page.getByText("ENTWURF")).toBeVisible({ timeout: 15_000 });
    if (info.project.name === "desktop-chromium" && typeof page.pdf === "function") {
      await page.pdf({ path: `e2e/pdf/${label}-entwurf.pdf`, format: "A4", printBackground: true });
    }
  });
}
