import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2b1-checks: ${message}`);
  }
}

/**
 * Structural checks for Tournament Detail V2-B1
 * (Turnier-Center shell + modern tab chrome only).
 */
export function runTournamentDetailV2B1Checks() {
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const page = read("src/app/turniere/[slug]/page.tsx");
  const resolvers = read("src/lib/mein-turnierplan-public-source.ts");
  const standings = read("src/components/tournaments/StandingsTable.tsx");
  const logo = read("src/components/tournaments/ParticipantClubLogo.tsx");
  const hero = read("src/components/tournaments/TournamentHero.tsx");
  const infoGrid = read("src/components/tournaments/TournamentInfoGrid.tsx");
  const description = read(
    "src/components/tournaments/TournamentDescription.tsx",
  );
  const extraInfo = read("src/components/tournaments/TournamentExtraInfo.tsx");
  const partners = read(
    "src/components/tournaments/TournamentPartnersSection.tsx",
  );
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  // 1 Turnier-Center heading
  assert(
    stage.includes("Turnier-Center") &&
      stage.includes("bg-brand-yellow") &&
      /showTabs \? \(/.test(stage),
    "Turnier-Center heading exists and is gated by showTabs",
  );

  // 2 tab keys unchanged
  for (const id of [
    "uebersicht",
    "teilnehmer",
    "gruppen",
    "spielplan",
    "tabelle",
    "ko-runde",
    "live",
  ]) {
    assert(stage.includes(`id: "${id}"`), `tab key retained: ${id}`);
  }

  // 3–5 URL / asTab / invalid-default
  assert(
    stage.includes('item.id === "uebersicht"') &&
      stage.includes("`/turniere/${slug}`") &&
      stage.includes("`/turniere/${slug}?tab=${item.id}`"),
    "Übersicht and ?tab= href patterns unchanged",
  );
  assert(
    stage.includes("function asTab") &&
      stage.includes('return "uebersicht"') &&
      stage.includes('requested === "ko-runde" && knockoutMatches.length === 0'),
    "invalid-tab / ko fallback still defaults to uebersicht",
  );

  // 6–8 KO / Live / showTabs
  assert(
    stage.includes(
      'tabs.filter((item) => item.id !== "ko-runde" || knockoutMatches.length > 0)',
    ),
    "KO conditional visibility unchanged",
  );
  assert(
    stage.includes("showLiveTab ? [...baseTabs, liveTab] : [...baseTabs]") &&
      stage.includes('id: "live"'),
    "Live conditional visibility unchanged",
  );
  assert(
    stage.includes("stage.groups.length > 0") &&
      stage.includes("stage.matches.length > 0") &&
      stage.includes("showLiveTab") &&
      stage.includes("mtp.usesPublicSource"),
    "showTabs logic unchanged",
  );

  // 9–12 a11y + Links
  assert(
    stage.includes('aria-label="Turnierbereiche"') &&
      stage.includes("<nav") &&
      stage.includes("<Link"),
    "nav semantics and Link tabs retained",
  );
  assert(
    stage.includes('aria-current={active ? "page" : undefined}'),
    "active Link gets aria-current=page",
  );
  assert(
    stage.includes("focus-visible:outline-2") &&
      stage.includes("focus-visible:outline-brand-yellow"),
    "focus-visible styles present on tabs",
  );
  assert(
    !stage.includes('role="tablist"') &&
      !stage.includes("<button") &&
      stage.includes("from \"next/link\""),
    "tabs remain Links (not buttons / tablist)",
  );

  // 13 mobile horizontal overflow
  assert(
    stage.includes("overflow-x-auto") &&
      stage.includes("flex-nowrap") &&
      stage.includes("shrink-0") &&
      stage.includes("w-max"),
    "mobile horizontal overflow strategy exists",
  );

  // 14–19 content paths still present (no B2 redesign markers that remove content)
  const participantCards = read(
    "src/components/tournaments/TournamentParticipantCards.tsx",
  );
  assert(
    stage.includes("Noch keine bestätigten Teams.") &&
      stage.includes("TournamentParticipantCards") &&
      participantCards.includes("ParticipantClubLogo") &&
      participantCards.includes("hasDistinctTeamName"),
    "participant rendering path retained (hub cards + logo + team label)",
  );
  assert(
    stage.includes("TournamentGroupCards") &&
      (stage.includes("Noch keine Teams zugeordnet.") ||
        read("src/components/tournaments/TournamentGroupCards.tsx").includes(
          "Noch keine Teams zugeordnet.",
        )) &&
      stage.includes("resolveGruppenTab"),
    "group rendering path retained",
  );
  assert(
    stage.includes("Der Spielplan wird noch veröffentlicht.") &&
      stage.includes("MeinTurnierplanWidget") &&
      stage.includes('iframeId="widgetMatches"'),
    "schedule rendering path retained",
  );
  assert(
    stage.includes("<StandingsTable") &&
      stage.includes("computeGroupStandings") &&
      stage.includes('iframeId="widgetTable"'),
    "standings rendering path retained",
  );
  assert(
    stage.includes("PublicRoundCard") &&
      stage.includes("computeKnockoutPlacements"),
    "KO content path retained",
  );
  assert(
    stage.includes("<MeinTurnierplanLiveSection") &&
      stage.includes('current === "live"'),
    "Live content path retained",
  );

  // 20–21 resolvers / MTP source unchanged (file still exports same functions; stage still imports)
  assert(
    resolvers.includes("export function resolveTeilnehmerTab") &&
      resolvers.includes("export function resolveGruppenTab") &&
      resolvers.includes("export function resolveSpielplanTab") &&
      resolvers.includes("export function resolveTabelleTab") &&
      stage.includes("resolveTeilnehmerTab({") &&
      stage.includes("preferSyncedHub: preferSyncedHubData"),
    "resolver wiring unchanged",
  );

  // 22 V2-A untouched (page still wires V2-A; hero files still exist with expected markers)
  assert(
    page.includes("<TournamentHero") &&
      page.includes("<TournamentInfoGrid") &&
      page.includes("<TournamentPartnersSection") &&
      hero.includes("TournamentImageFrame") &&
      infoGrid.includes("Turnierinfos") &&
      description.includes("Beschreibung") &&
      extraInfo.includes("items.map") &&
      partners.includes('size="tournament"') &&
      !partners.includes("Alle Partner anzeigen"),
    "V2-A components still present / untouched by B1 scope",
  );

  // page.tsx should not be required for B1
  assert(
    page.includes("<TournamentPublicStage") &&
      page.includes("tab={tab}") &&
      !page.includes("Turnier-Center"),
    "page.tsx does not own Turnier-Center (stage-internal)",
  );

  // shared components not redesigned
  assert(
    standings.includes("export function StandingsTable") &&
      logo.includes("export function ParticipantClubLogo"),
    "StandingsTable and ParticipantClubLogo files remain present",
  );

  // 23 no migration / db
  assert(
    migrationFiles.filter((name) => /partner/i.test(name)).length === 3,
    "no new partner/stage migrations",
  );
  assert(
    !stage.includes("service_role") && !stage.includes('.from("'),
    "no new Supabase access in stage chrome",
  );

  return "ok";
}
