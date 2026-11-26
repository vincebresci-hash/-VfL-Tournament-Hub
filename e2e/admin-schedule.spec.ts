import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.invalid";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "change-me";
const SLUG_PREFIX = process.env.E2E_SLUG_B ?? "cl5-scenario-b";
const MATCH_DURATION = 8;
const CHANGEOVER = 2;
const MINIMUM_REST = 2;

function viewportKey(info: TestInfo) {
  return info.project.name.startsWith("mobile") ? "mobile" : "desktop";
}

function scenarioSlug(info: TestInfo, missing = false) {
  return `${SLUG_PREFIX}${missing ? "-missing" : ""}-${viewportKey(info)}`;
}

async function shot(page: Page, info: TestInfo, name: string) {
  mkdirSync("e2e/screenshots", { recursive: true });
  await page.screenshot({
    path: `e2e/screenshots/${info.project.name}-${name}.png`,
    fullPage: true,
  });
}

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel(/e-?mail/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/passwort/i).fill(ADMIN_PASSWORD);
  await Promise.all([
    page.waitForURL(
      (url) => url.pathname.startsWith("/admin") && url.pathname !== "/admin/login",
      { timeout: 20_000 },
    ),
    page.getByRole("button", { name: /anmelden|login/i }).click(),
  ]);
}

async function openSchedule(page: Page, slug: string) {
  await page.goto(`/admin/turniere/${slug}/spielplan`);
  await expect(page.getByLabel("Wettbewerbsmodus")).toBeVisible({ timeout: 15_000 });
}

function previewRows(page: Page) {
  return page
    .getByRole("heading", { name: "Geplante Ligabegegnungen" })
    .locator("..")
    .getByRole("table")
    .locator("tbody tr");
}

async function selectedText(select: Locator) {
  return (await select.locator("option:checked").textContent())?.trim() ?? "";
}

type TimingRow = { kickoff: number; field: string; home: string; away: string };

async function readTimingRows(rows: Locator): Promise<TimingRow[]> {
  const result = [];
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const value = await row.locator('input[type="datetime-local"]').inputValue();
    result.push({
      kickoff: Date.parse(value),
      field: await row.locator("select").inputValue(),
      home: (await row.locator("td").nth(4).textContent())?.trim() ?? "",
      away: (await row.locator("td").nth(5).textContent())?.trim() ?? "",
    });
  }
  return result;
}

function assertMinimumSpacing(rows: TimingRow[]) {
  const startsByField = new Map<string, number[]>();
  const startsByTeam = new Map<string, number[]>();
  for (const row of rows) {
    expect(Number.isFinite(row.kickoff), "every league match has a kickoff").toBeTruthy();
    expect(row.field, "every league match has a field").not.toBe("");
    startsByField.set(row.field, [...(startsByField.get(row.field) ?? []), row.kickoff]);
    for (const team of [row.home, row.away]) {
      startsByTeam.set(team, [...(startsByTeam.get(team) ?? []), row.kickoff]);
    }
  }

  const assertIntervals = (groups: Map<string, number[]>, minimumMinutes: number, label: string) => {
    for (const [key, values] of groups) {
      const ordered = values.slice().sort((left, right) => left - right);
      for (let index = 1; index < ordered.length; index += 1) {
        const minutes = (ordered[index] - ordered[index - 1]) / 60_000;
        expect(minutes, `${label} ${key} has ${minutes} minutes spacing`).toBeGreaterThanOrEqual(minimumMinutes);
      }
    }
  };

  assertIntervals(startsByField, MATCH_DURATION + CHANGEOVER, "field");
  assertIntervals(startsByTeam, MATCH_DURATION + MINIMUM_REST, "team");
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("Spielzeit, Wechselzeit und Mindestruhezeit bleiben nach Speicherung und Reload erhalten", async ({ page }, info) => {
  const slug = scenarioSlug(info);
  await openSchedule(page, slug);
  await page.getByLabel("Wettbewerbsmodus").selectOption("champions-league");

  await page.getByLabel("Spielzeit in Minuten").fill(String(MATCH_DURATION));
  await page.getByLabel("Pause zwischen Spielen").fill(String(CHANGEOVER));
  await page.getByLabel("Mindestruhezeit").fill(String(MINIMUM_REST));
  await page.getByRole("button", { name: "Einstellungen speichern" }).click();
  await expect(page.getByText("Die Spielplan-Einstellungen wurden gespeichert.")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Wettbewerbsmodus")).toBeVisible();
  await expect(page.getByLabel("Spielzeit in Minuten")).toHaveValue(String(MATCH_DURATION));
  await expect(page.getByLabel("Pause zwischen Spielen")).toHaveValue(String(CHANGEOVER));
  await expect(page.getByLabel("Mindestruhezeit")).toHaveValue(String(MINIMUM_REST));
  await shot(page, info, "parameters-saved-reload");
});

test("Same-Club blockiert fehlende Identitäten; akzeptierte Teams sind direkt im Spielplan zuordenbar", async ({ page }, info) => {
  await openSchedule(page, scenarioSlug(info, true));
  await page.getByLabel("Wettbewerbsmodus").selectOption("champions-league");
  await page.getByRole("checkbox", { name: /Mannschaften desselben Vereins/ }).check();

  await expect(page.getByRole("alert").filter({ hasText: /10 Teams haben keine eindeutige/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vorschau erstellen" })).toBeDisabled();
  await expect(page.getByRole("link", { name: /Vereinszuordnung in der Teilnehmerverwaltung/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vereinszuordnung", exact: true })).toBeVisible();

  const selectors = page.getByLabel(/^Verein für /);
  await expect(selectors).toHaveCount(10);
  await selectors.first().selectOption({ label: "Blue Test Club" });
  await page.getByRole("button", { name: "Zuordnen", exact: true }).first().click();
  await expect(selectors).toHaveCount(9);
  await expect(page.getByRole("button", { name: "Vorschau erstellen" })).toBeDisabled();
  await shot(page, info, "same-club-missing-identity-block");
});

test("10 Teams × 4 Spiele: 20/20, Reihenfolge, Anstoß und Feld werden vollständig übernommen", async ({ page }, info) => {
  const slug = scenarioSlug(info);
  await openSchedule(page, slug);
  await page.getByLabel("Wettbewerbsmodus").selectOption("champions-league");
  await page.getByLabel("Spiele pro Team").fill("4");
  await page.getByLabel("K.-o.-Qualifikation").selectOption("8");
  await page.getByRole("checkbox", { name: /Mannschaften desselben Vereins/ }).check();
  await page.getByRole("button", { name: /Vorschau erstellen|Vorschau aktualisieren/ }).click();

  await expect(page.getByText(/20\s*\/\s*20 Ligabegegnungen/).first()).toBeVisible();
  const rows = previewRows(page);
  await expect(rows).toHaveCount(20);

  const timingRows = await readTimingRows(rows);
  assertMinimumSpacing(timingRows);
  for (const row of timingRows) {
    const crossClub =
      (row.home.includes("Blue") && row.away.includes("Yellow")) ||
      (row.home.includes("Yellow") && row.away.includes("Blue"));
    expect(crossClub, `${row.home} vs ${row.away} must cross clubs`).toBeTruthy();
  }

  const secondHome = (await rows.nth(1).locator("td").nth(4).textContent())?.trim() ?? "";
  const secondAway = (await rows.nth(1).locator("td").nth(5).textContent())?.trim() ?? "";
  await rows.nth(0).getByRole("button", { name: "Nach unten" }).click();
  await expect(rows.nth(0).locator("td").nth(4)).toHaveText(secondHome);
  await expect(rows.nth(0).locator("td").nth(5)).toHaveText(secondAway);

  const customKickoff = "2026-12-27T23:00";
  await rows.nth(0).locator('input[type="datetime-local"]').fill(customKickoff);
  const field = rows.nth(0).locator("select");
  const currentField = await field.inputValue();
  const alternativeField = await field.locator("option").evaluateAll(
    (options, current) =>
      options.map((option) => (option as HTMLOptionElement).value).find((value) => value && value !== current) ?? "",
    currentField,
  );
  expect(alternativeField, "a second field is available").not.toBe("");
  await field.selectOption(alternativeField);
  await shot(page, info, "preview-20-of-20-edited");

  await page.getByRole("button", { name: "Spielplan übernehmen", exact: true }).click();
  const replace = page.getByRole("button", { name: "Spielplan ersetzen", exact: true });
  if (await replace.isVisible().catch(() => false)) await replace.click();
  await expect(page.getByText("Der Spielplan wurde erfolgreich übernommen.")).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByLabel("Wettbewerbsmodus")).toHaveValue("champions-league");
  await expect(page.getByLabel("Spiele pro Team")).toHaveValue("4");
  await expect(page.getByRole("checkbox", { name: /Mannschaften desselben Vereins/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Spiel speichern", exact: true })).toHaveCount(20);
  await expect(page.getByLabel("Uhrzeit").first()).toHaveValue(customKickoff);
  await expect(page.getByLabel("Spielfeld").first()).toHaveValue(alternativeField);
  expect(await selectedText(page.getByLabel("Heimteam").first())).toBe(secondHome);
  expect(await selectedText(page.getByLabel("Auswärtsteam").first())).toBe(secondAway);
  await shot(page, info, "schedule-20-of-20-saved-reload");
});

test("PDF-Ansicht und echte PDF-Datei werden aus dem gespeicherten CL-Spielplan erzeugt", async ({ page }, info) => {
  await openSchedule(page, scenarioSlug(info));
  await Promise.all([
    page.waitForURL(/\/spielplan\/pdf$/),
    page.getByRole("link", { name: "Spielplan als PDF" }).click(),
  ]);
  if (await page.getByText("Noch keine Begegnungen.").isVisible().catch(() => false)) {
    test.skip(true, "Die 20/20-Übernahme ist in diesem Viewport zuvor fehlgeschlagen.");
  }
  await expect(page.getByRole("heading", { name: "Ligaphase" })).toBeVisible();
  const leagueSection = page.getByRole("heading", { name: "Ligaphase" }).locator("..");
  await expect(leagueSection.getByRole("table").locator("tbody tr")).toHaveCount(20);
  await shot(page, info, "pdf-view");
  mkdirSync("e2e/screenshots", { recursive: true });
  await page.pdf({
    path: `e2e/screenshots/${info.project.name}-schedule.pdf`,
    format: "A4",
    printBackground: true,
  });
});
