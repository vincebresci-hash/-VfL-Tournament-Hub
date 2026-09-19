import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2a-checks: ${message}`);
  }
}

/**
 * Structural regression checks for Tournament Detail V2-A
 * (Hero + Partner strip + Turnierinfos + Beschreibung).
 * TournamentPublicStage / V2-B must remain untouched.
 */
export function runTournamentDetailV2AChecks() {
  const page = read("src/app/turniere/[slug]/page.tsx");
  const hero = read("src/components/tournaments/TournamentHero.tsx");
  const infoGrid = read("src/components/tournaments/TournamentInfoGrid.tsx");
  const description = read(
    "src/components/tournaments/TournamentDescription.tsx",
  );
  const extraInfo = read("src/components/tournaments/TournamentExtraInfo.tsx");
  const partnersSection = read(
    "src/components/tournaments/TournamentPartnersSection.tsx",
  );
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const queries = read("src/lib/partners/queries.ts");
  const publicTournament = read("src/lib/public-tournament.ts");
  const applicationState = read("src/lib/public-application-state.ts");
  const infoSection = read("src/components/home/InfoSection.tsx");
  const partnerPage = read("src/app/partner/page.tsx");
  const partnerGrid = read("src/components/partners/PartnerLogoGrid.tsx");
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  // 1 Hero uses existing tournament image + object position
  assert(
    hero.includes("TournamentImageFrame") &&
      hero.includes("tournamentImageObjectPosition") &&
      hero.includes("variant=\"hero\"") &&
      page.includes("<TournamentHero") &&
      page.includes("image={tournament.image}"),
    "Hero uses existing tournament image via TournamentImageFrame",
  );

  // 2–4 application status + CTA gate unchanged
  assert(
    page.includes("getPublicApplicationStatusDisplay(applicationGate)") &&
      hero.includes("applicationStatusDisplay.label") &&
      hero.includes("applicationStatusDisplay.className"),
    "Hero uses existing application status display",
  );
  assert(
    page.includes("getPublicApplicationState(applicationGate)") &&
      page.includes(
        'applicationState === "open" || applicationState === "waitlist"',
      ) &&
      page.includes("`/turniere/${tournament.slug}/bewerben`") === false &&
      hero.includes("`/turniere/${slug}/bewerben`") &&
      hero.includes("canApply") &&
      hero.includes("ctaLabel") &&
      !hero.includes("getPublicApplicationState") &&
      !hero.includes("isFull") &&
      !applicationState.includes("TournamentHero"),
    "Hero CTA uses existing gate/state; no new eligibility logic in Hero",
  );
  assert(
    page.includes('? "Für Warteliste bewerben →"') &&
      page.includes('"Jetzt bewerben →"') &&
      hero.includes("coming-soon") &&
      hero.includes("Demnächst bewerben"),
    "CTA labels derived on page; coming-soon presentation in Hero",
  );

  // 5–6 capacity presentation only
  assert(
    page.includes("getDisplayCapacity(tournament)") &&
      page.includes("capacity?.availableSlots") &&
      hero.includes("availableSlots") &&
      hero.includes("showAvailability") &&
      !hero.includes("maxTeams -") &&
      !hero.includes("confirmedTeams") &&
      publicTournament.includes(
        "availableSlots: Math.max(0, tournament.maxTeams - tournament.confirmedTeams)",
      ),
    "Hero availability derives from existing display capacity only",
  );
  assert(
    page.includes("String(capacity.availableSlots)") &&
      !page.includes("availableSlots +") &&
      !page.includes("availableSlots -"),
    "no capacity recalculation on page",
  );

  // 7–10 Partner guarantees
  assert(
    page.includes("listPublicActivePartnersForTournament(tournament.id)") &&
      queries.includes("export async function listPublicActivePartnersForTournament") &&
      queries.includes('.eq("partners.is_active", true)'),
    "Partner helper unchanged and still used",
  );
  assert(
    /if \(partners\.length === 0\) \{\s*return null;\s*\}/.test(partnersSection) &&
      !partnersSection.includes("Keine Partner"),
    "zero Partners still render nothing",
  );
  assert(
    !page.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT") &&
      !partnersSection.includes(".slice(") &&
      partnersSection.includes('size="tournament"'),
    "all assigned active Partners render; no max-3",
  );
  assert(
    !partnersSection.includes('href="/partner"') &&
      !partnersSection.includes("Alle Partner anzeigen") &&
      !partnersSection.includes("listPublicActivePartners("),
    "tournament Partner section has no global /partner link",
  );

  // 12–14 facts + filledPublicInfo + description
  const requiredFactLabels = [
    "Altersklasse",
    "Jahrgang",
    "Datum",
    "Startzeit",
    "Geplantes Ende",
    "Veranstaltungsort",
    "Adresse",
    "Bewerbungsstart",
    "Bewerbungsfrist",
    "Max. Teams",
    "Bestätigte Teams",
    "Freie Plätze",
    "Warteliste",
  ];
  for (const label of requiredFactLabels) {
    assert(
      page.includes(`label: "${label}"`),
      `fact label retained: ${label}`,
    );
  }
  assert(
    page.includes("<TournamentInfoGrid facts={facts} />") &&
      infoGrid.includes("Turnierinfos") &&
      infoGrid.includes('fact.label === "Freie Plätze"'),
    "Turnierinfos redesigned via TournamentInfoGrid",
  );
  assert(
    page.includes("filledPublicInfo(tournament)") &&
      page.includes("<TournamentExtraInfo items={extraInfo} />") &&
      extraInfo.includes("items.map"),
    "filledPublicInfo remains represented",
  );
  assert(
    page.includes("<TournamentDescription description={longDescription} />") &&
      description.includes("whitespace-pre-line") &&
      description.includes("{description}") &&
      !description.includes(".slice(") &&
      !description.includes("truncate"),
    "long description remains complete",
  );

  // 15 MTP visibility unchanged
  assert(
    page.includes("showMeinTurnierplan && !showLiveTab") &&
      page.includes("<MeinTurnierplanPublicButton") &&
      page.includes("isMeinTurnierplanPublic(tournament)"),
    "MeinTurnierplan visibility logic unchanged",
  );

  // 16–17 TournamentPublicStage / ?tab unchanged (no V2-B)
  assert(
    page.includes("<TournamentPublicStage") &&
      page.includes("tab={tab}") &&
      !page.includes("Zum Spielplan") &&
      !hero.includes("Zum Spielplan") &&
      !hero.includes("tab=spielplan"),
    "TournamentPublicStage still wired; Spielplan CTA omitted in V2-A",
  );
  // Stage file must not be modified for V2-A — assert key invariants still present
  assert(
    stage.includes('id: "uebersicht"') &&
      stage.includes('id: "teilnehmer"') &&
      stage.includes("resolveSpielplanTab") &&
      stage.includes("resolveTeilnehmerTab") &&
      !stage.includes("TournamentHero") &&
      !stage.includes("TournamentInfoGrid"),
    "TournamentPublicStage implementation/functionality unchanged for V2-A",
  );

  // 18–20 homepage / partner / admin
  assert(
    infoSection.includes("HOMEPAGE_PARTNER_PREVIEW_LIMIT = 3") &&
      infoSection.includes('size="home"') &&
      !infoSection.includes("TournamentHero"),
    "homepage unchanged",
  );
  assert(
    partnerPage.includes('size="page"') &&
      !partnerPage.includes("TournamentPartnersSection") &&
      !partnerPage.includes("TournamentHero"),
    "/partner unchanged",
  );
  assert(
    partnerGrid.includes('tone = "default"') &&
      partnerGrid.includes('size === "tournament"'),
    "Partner shared defaults remain; tournament variant scoped",
  );

  // 21 no migration / RPC / RLS / RBAC drift
  const partnerMigrations = migrationFiles.filter((name) =>
    /partner/i.test(name),
  );
  assert(
    partnerMigrations.length === 3,
    "no V2-A migration added",
  );
  assert(
    !page.includes("service_role") &&
      !hero.includes("createClient") &&
      !infoGrid.includes("from(\""),
    "no new Supabase access in V2-A presentation",
  );

  // Hierarchy: Hero → Partner → Info → Description → Extra → Stage
  const order = [
    page.indexOf("<TournamentHero"),
    page.indexOf("<TournamentPartnersSection"),
    page.indexOf("<TournamentInfoGrid"),
    page.indexOf("<TournamentDescription"),
    page.indexOf("<TournamentExtraInfo"),
    page.indexOf("<TournamentPublicStage"),
  ];
  assert(
    order.every((idx) => idx > 0) &&
      order.every((idx, i) => i === 0 || idx > order[i - 1]!),
    "V2-A section order: Hero → Partner → Info → Description → Extra → Stage",
  );

  return "ok";
}
