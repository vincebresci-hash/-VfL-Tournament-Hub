import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@example.invalid";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "change-me";

const SCENARIOS = [
  { slug: "cl6-pdf-cl-single", label: "champions-league-1-feld", matches: 20, fields: 1, kind: "cl" },
  { slug: "cl6-pdf-cl-two", label: "champions-league-2-felder", matches: 64, fields: 2, kind: "cl" },
  { slug: "cl6-pdf-cl-three", label: "champions-league-3-felder", matches: 45, fields: 3, kind: "cl" },
  { slug: "cl6-pdf-groups", label: "klassisches-gruppenturnier", matches: 12, fields: 2, kind: "groups" },
  { slug: "cl6-pdf-bambini", label: "bambini-turnier", matches: 12, fields: 1, kind: "bambini" },
] as const;

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

for (const scenario of SCENARIOS) {
  test(`saved PDF artifact: ${scenario.label}`, async ({ page }, info) => {
    await page.goto(`/admin/turniere/${scenario.slug}/spielplan/pdf`);
    await expect(page.getByText(/Teilnehmer \(/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Diese vollständige Beschreibung wird dynamisch/)).toBeVisible();
    await expect(page.getByText(/Spielplan|Ligaphase/).first()).toBeVisible();
    await expect(page.locator(".pdf-root")).toHaveAttribute("class", /pdf-root/);
    await expect(page.locator("[data-match-key]")).toHaveCount(scenario.matches);
    await expect(page.getByText(new RegExp(`${scenario.fields} Feld(?:er)?`)).first()).toBeVisible();
    await expect(page.getByText("Verein · Mannschaft", { exact: true })).toHaveCount(0);
    await expect(page.getByText(new RegExp(`Testverein 1.*${scenario.kind === "bambini" ? "Bambini" : scenario.kind === "groups" ? "F-Jugend" : "U1[345]"} Mannschaft 1`)).first()).toBeVisible();

    if (scenario.kind === "bambini") {
      await expect(page.getByRole("columnheader", { name: "Ergebnis" })).toHaveCount(0);
      await expect(page.locator("[data-match-result]")).toHaveCount(0);
      await expect(page.getByText(/Gesamttabelle|Tabellen|K\.‑o\.-Runde/)).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Gruppe A", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Gruppe B", exact: true })).toBeVisible();
    } else {
      await expect(page.locator("[data-match-result]")).toHaveCount(scenario.matches);
      await expect(page.getByText(/Gesamttabelle|Tabellen/).first()).toBeVisible();
    }
    if (scenario.kind === "groups") {
      await expect(page.getByRole("heading", { name: "Gruppe A", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Gruppe B", exact: true })).toBeVisible();
    }

    if (scenario.kind === "cl" || scenario.kind === "groups") {
      await expect(page.getByText("Finale", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Spiel um Platz 3", { exact: true }).first()).toBeVisible();
      await expect(page.locator(".pdf-bracket-connector").first()).toBeVisible();
    }

    await page.screenshot({
      path: `e2e/screenshots/${info.project.name}-${scenario.label}.png`,
      fullPage: true,
    });
    if (info.project.name === "desktop-chromium") {
      await page.pdf({
        path: `e2e/pdf/${scenario.label}.pdf`,
        printBackground: true,
        preferCSSPageSize: true,
      });
    }
  });
}

test("real draft PDF uses edited pairing, order, kickoff and field without saving", async ({ page }, info) => {
  await page.goto("/admin/turniere/cl6-pdf-cl-two/spielplan");
  await expect(page.getByLabel("Wettbewerbsmodus")).toHaveValue("champions-league");
  await page.getByRole("button", { name: /Vorschau erstellen|Vorschau aktualisieren/ }).click();
  await expect(page.getByText(/64\s*\/\s*64 Ligabegegnungen/).first()).toBeVisible({ timeout: 15_000 });

  const rows = page.getByRole("heading", { name: "Geplante Ligabegegnungen" }).locator("..").getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(64);
  const originalSecondHome = await rows.nth(1).getByLabel(/Heimteam Vorschau Spiel 2/).inputValue();
  await rows.nth(0).getByRole("button", { name: "Nach unten" }).click();
  await expect(rows.nth(0).getByLabel(/Heimteam Vorschau Spiel 1/)).toHaveValue(originalSecondHome);

  const home = rows.nth(0).getByLabel(/Heimteam Vorschau Spiel 1/);
  const currentHome = await home.inputValue();
  const changedHome = await home.locator("option").evaluateAll(
    (options, current) => options.map((option) => (option as HTMLOptionElement).value).find((value) => value !== current) ?? "",
    currentHome,
  );
  await home.selectOption(changedHome);
  const changedHomeLabel = (await home.locator("option:checked").textContent())?.trim() ?? "";

  const kickoff = rows.nth(0).getByLabel(/Anstoßzeit Spiel 1/);
  await kickoff.fill("2026-12-28T11:17");
  const displayedKickoff = (await kickoff.locator("..").locator("span").textContent())?.trim() ?? "";

  const field = rows.nth(0).getByLabel(/Spielfeld Spiel 1/);
  const currentField = await field.inputValue();
  const changedField = await field.locator("option").evaluateAll(
    (options, current) => options.map((option) => (option as HTMLOptionElement).value).find((value) => value && value !== current) ?? "",
    currentField,
  );
  await field.selectOption(changedField);
  const changedFieldLabel = (await field.locator("option:checked").textContent())?.trim() ?? "";

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Vorschau als PDF" }).click(),
  ]);
  await popup.waitForLoadState("networkidle");
  await expect(popup.getByText("ENTWURF", { exact: true })).toBeVisible();
  await expect(popup.getByText(changedHomeLabel, { exact: true }).first()).toBeVisible();
  await expect(popup.getByText(displayedKickoff, { exact: true }).first()).toBeVisible();
  await expect(popup.getByText(changedFieldLabel, { exact: true }).first()).toBeVisible();
  await expect(popup.getByText(/64 Ligabegegnungen|8 Spiele\/Team/).first()).toBeVisible();

  await popup.screenshot({ path: `e2e/screenshots/${info.project.name}-echter-entwurf.png`, fullPage: true });
  if (info.project.name === "desktop-chromium") {
    await popup.pdf({
      path: "e2e/pdf/champions-league-echter-entwurf.pdf",
      printBackground: true,
      preferCSSPageSize: true,
    });
  }
});

test("quelle=entwurf alone never relabels saved data", async ({ page }) => {
  await page.goto("/admin/turniere/cl6-pdf-cl-single/spielplan/pdf?quelle=entwurf");
  await expect(page.getByText(/Für ein echtes Entwurfs-PDF/)).toContainText("direkt aus der geöffneten Spielplanvorschau");
  await expect(page.locator(".pdf-root")).toHaveCount(0);
});

test("18 teams × 8 games matrix is complete and Top 16 bracket is visible", async ({ page }) => {
  await page.goto("/admin/turniere/cl6-matrix-18x8/spielplan/pdf");
  await expect(page.locator("[data-match-key]")).toHaveCount(72);
  await expect(page.getByText("Achtelfinale", { exact: true })).toBeVisible();
  await expect(page.getByText("Platz 16", { exact: true })).toBeVisible();
});

test("legacy single-group tournament prints its configured complete end round", async ({ page }, info) => {
  await page.goto("/admin/turniere/cl61-pdf-legacy-one-group/spielplan/pdf");
  await expect(page.locator("[data-match-key]")).toHaveCount(12);
  await expect(page.locator("[data-knockout-key]")).toHaveCount(4);
  await expect(page.getByText("Halbfinale", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Finale", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Spiel um Platz 3", { exact: true }).first()).toBeVisible();
  if (info.project.name === "desktop-chromium") {
    await page.pdf({
      path: "e2e/pdf/legacy-ein-gruppe-vollstaendige-endrunde.pdf",
      printBackground: true,
      preferCSSPageSize: true,
    });
  }
});

test("pure classic group tournament never invents a knockout stage", async ({ page }, info) => {
  await page.goto("/admin/turniere/cl61-pdf-groups-only/spielplan/pdf");
  await expect(page.getByRole("heading", { name: "Gruppe A", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gruppe B", exact: true })).toBeVisible();
  await expect(page.locator("[data-knockout-key]")).toHaveCount(0);
  await expect(page.getByText(/Endrunden-Spielplan|K.-o.-Runde/)).toHaveCount(0);
  if (info.project.name === "desktop-chromium") {
    await page.pdf({
      path: "e2e/pdf/klassisch-nur-gruppenphase.pdf",
      printBackground: true,
      preferCSSPageSize: true,
    });
  }
});

test("qualification names appear only after the league phase is final", async ({ page }, info) => {
  await page.goto("/admin/turniere/cl61-pdf-partial/spielplan/pdf");
  await expect(page.locator(".pdf-bracket")).toContainText("Platz 1");
  await expect(page.locator("[data-knockout-key]")).toHaveCount(4);

  await page.goto("/admin/turniere/cl61-pdf-complete/spielplan/pdf");
  await expect(page.locator(".pdf-bracket")).not.toContainText("Platz 1");
  await expect(page.locator(".pdf-bracket")).toContainText("Testverein");
  await expect(page.locator("[data-knockout-key]")).toHaveCount(4);
  if (info.project.name === "desktop-chromium") {
    await page.pdf({
      path: "e2e/pdf/cl-vollstaendige-ligaphase-mit-qualifikanten.pdf",
      printBackground: true,
      preferCSSPageSize: true,
    });
  }
});

test("public Champions League view exposes league schedule, standings and knockout without dirty names", async ({ page }) => {
  await page.goto("/turniere/cl6-pdf-cl-three");
  await expect(page.getByRole("heading", { name: /CL 18 Teams/ })).toBeVisible();
  await expect(page.getByText(/Gesamttabelle|Ligatabelle/).first()).toBeVisible();
  await page.getByRole("link", { name: "Spielplan", exact: true }).click();
  await expect(page.getByText(/Ligaphase|Spielplan/).first()).toBeVisible();
  await page.getByRole("link", { name: "KO-Runde", exact: true }).click();
  await expect(page.getByRole("heading", { name: "K.-o.-Baum" })).toBeVisible();
  await expect(page.getByText(/vollständigen Ligaphase|wird noch veröffentlicht/)).toBeVisible();
  await expect(page.locator("body")).not.toContainText("example.test");
});

test("schedule PDF and draft transport remain admin-protected", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/admin/turniere/cl6-pdf-cl-single/spielplan/pdf");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/turniere/cl6-pdf-cl-single/spielplan/pdf?quelle=entwurf&entwurf=synthetic");
  await expect(page).toHaveURL(/\/admin\/login/);
  await context.close();
});
