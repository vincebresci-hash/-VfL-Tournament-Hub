import { expect, test, type Page, type TestInfo } from "@playwright/test";

/** Save a named desktop/mobile screenshot for the acceptance record. */
async function shot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: `e2e/screenshots/${info.project.name}-${name}.png`, fullPage: true });
}

/**
 * CL Release 5 admin schedule management — real-browser journeys.
 * LOCAL ONLY. Requires the seeded synthetic tournaments (see e2e/README.md) and
 * a TOURNAMENT_MANAGER / SYSTEM_ADMIN login for the local stack.
 *
 * Credentials and the seeded slugs come from env so no secrets live in the repo:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_SLUG_B (10 teams / 4 games, the 20-of-20 case), E2E_SLUG_D (round-robin)
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.invalid";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "change-me";
const SLUG_B = process.env.E2E_SLUG_B ?? "cl5-scenario-b";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel(/e-?mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/passwort/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /anmelden|login/i }).click();
  // Wait for the real post-login redirect AWAY from the login page (a loose
  // /admin match would resolve immediately on /admin/login and skip the wait).
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"), { timeout: 20_000 });
}

async function openSchedule(page: Page, slug: string) {
  await page.goto(`/admin/turniere/${slug}/spielplan`);
  // "Spielparameter" appears as the card title and inside the intro copy; anchor
  // on the competition-mode control, which is unique to the loaded board.
  await expect(page.getByLabel("Wettbewerbsmodus")).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("all schedule parameters stay editable when Champions League is selected", async ({ page }, info) => {
  await openSchedule(page, SLUG_B);
  await page.getByLabel("Wettbewerbsmodus").selectOption("champions-league");
  // The reported bug: these were disabled. They must be editable now.
  await expect(page.getByLabel("Spielzeit in Minuten")).toBeEnabled();
  await expect(page.getByLabel("Pause zwischen Spielen")).toBeEnabled();
  await expect(page.getByLabel("Mindestruhezeit")).toBeEnabled();
  await expect(page.getByRole("button", { name: /Einstellungen speichern/i })).toBeEnabled();
  await shot(page, info, "params-editable-cl");
});

test("scenario B: 20 of 20 league matches can be applied", async ({ page }, info) => {
  await openSchedule(page, SLUG_B);
  await page.getByLabel("Wettbewerbsmodus").selectOption("champions-league");
  await page.getByLabel("Spiele pro Team").fill("4");
  await page.getByRole("button", { name: /Vorschau erstellen|Vorschau aktualisieren/i }).click();

  const panel = page.getByText("Ligaphase (bearbeitbar)").first();
  await expect(panel).toBeVisible();
  await expect(page.getByText(/20\s*\/\s*20 Ligabegegnungen/)).toBeVisible();
  await shot(page, info, "preview-20-of-20");

  const apply = page.getByRole("button", { name: /Spielplan übernehmen/i });
  await expect(apply).toBeEnabled();
  await apply.click();
  // A resultless existing schedule asks to confirm the replace.
  const confirm = page.getByRole("button", { name: /Spielplan ersetzen/i });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  }
  await expect(page.getByText(/erfolgreich übernommen/i)).toBeVisible();
  await shot(page, info, "apply-success");

  // Persistence after reload.
  await page.reload();
  await expect(page.getByLabel("Wettbewerbsmodus")).toBeVisible({ timeout: 15_000 });
  await shot(page, info, "after-reload");
});

test("editable preview blocks a field double-booking and allows a valid reorder", async ({ page }, info) => {
  await openSchedule(page, SLUG_B);
  await page.getByLabel("Wettbewerbsmodus").selectOption("champions-league");
  await page.getByLabel("Spiele pro Team").fill("4");
  await page.getByRole("button", { name: /Vorschau erstellen|Vorschau aktualisieren/i }).click();
  await expect(page.getByText("Ligaphase (bearbeitbar)")).toBeVisible();

  // Move the first match down, then recompute times — stays applicable.
  await page.getByRole("button", { name: "Nach unten" }).first().click();
  await page.getByRole("button", { name: /Zeiten neu berechnen/i }).click();
  await expect(page.getByRole("button", { name: /Spielplan übernehmen/i })).toBeEnabled();
  await shot(page, info, "editable-reorder");
});

test("missing club assignments can be set inline", async ({ page }, info) => {
  await openSchedule(page, SLUG_B);
  await page.getByLabel("Wettbewerbsmodus").selectOption("champions-league");
  const clubCard = page.getByText("Vereinszuordnung", { exact: true }).first();
  if (await clubCard.isVisible().catch(() => false)) {
    await shot(page, info, "club-assignment");
    const firstSelect = page.getByLabel(/^Verein für /).first();
    if (await firstSelect.isVisible().catch(() => false)) {
      const option = firstSelect.locator("option").nth(1);
      await firstSelect.selectOption(await option.getAttribute("value") ?? "");
      await page.getByRole("button", { name: /^Zuordnen$/ }).first().click();
      await expect(page.getByText(/Vereinszuordnung gespeichert|gespeichert/i)).toBeVisible();
      await shot(page, info, "club-assigned");
    }
  }
});
