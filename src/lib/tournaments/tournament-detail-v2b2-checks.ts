import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2b2-checks: ${message}`);
  }
}

/**
 * Structural checks for Tournament Detail V2-B2
 * (modern hub participant cards only).
 */
export function runTournamentDetailV2B2Checks() {
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const cards = read(
    "src/components/tournaments/TournamentParticipantCards.tsx",
  );
  const cardsGroup = read(
    "src/components/tournaments/TournamentGroupCards.tsx",
  );
  const page = read("src/app/turniere/[slug]/page.tsx");
  const resolvers = read("src/lib/mein-turnierplan-public-source.ts");
  const standings = read("src/components/tournaments/StandingsTable.tsx");
  const logo = read("src/components/tournaments/ParticipantClubLogo.tsx");
  const hero = read("src/components/tournaments/TournamentHero.tsx");
  const infoGrid = read("src/components/tournaments/TournamentInfoGrid.tsx");
  const description = read(
    "src/components/tournaments/TournamentDescription.tsx",
  );
  const extraInfo = read(
    "src/components/tournaments/TournamentExtraInfo.tsx",
  );
  const partners = read(
    "src/components/tournaments/TournamentPartnersSection.tsx",
  );
  const names = read("src/lib/schedule/names.ts");
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  // 1 participant source / resolver unchanged
  assert(
    stage.includes("resolveTeilnehmerTab({") &&
      stage.includes("hubRosterCount: stage.roster.length") &&
      stage.includes("preferSyncedHub: preferSyncedHubData") &&
      resolvers.includes("export function resolveTeilnehmerTab") &&
      /if \(input\.preferSyncedHub && input\.hubRosterCount > 0\)/.test(resolvers) &&
      /source: "mein-turnierplan"/.test(resolvers) &&
      /source: "unavailable"/.test(resolvers) &&
      /source: "hub"/.test(resolvers),
    "participant source/resolver wiring unchanged",
  );

  // 2 ordering unchanged — hub still maps stage.roster in order; cards map roster as received
  assert(
    stage.includes("<TournamentParticipantCards roster={stage.roster} />") &&
      cards.includes("roster.map((entry)") &&
      !cards.includes(".sort(") &&
      !stage.includes("roster.sort(") &&
      !stage.includes("[...stage.roster].sort"),
    "participant ordering unchanged (roster as-is)",
  );

  // 3 publicTeamLabel behavior unchanged
  assert(
    names.includes("export function publicTeamLabel") &&
      names.includes("export function hasDistinctTeamName") &&
      cards.includes("publicTeamLabel(entry.clubName, entry.teamName)") &&
      cards.includes("hasDistinctTeamName(entry.clubName, entry.teamName)") &&
      stage.includes("publicTeamLabel(entry.clubName, entry.teamName)"),
    "publicTeamLabel / hasDistinctTeamName usage retained",
  );

  // 4–5 ParticipantClubLogo + fallback
  assert(
    cards.includes("<ParticipantClubLogo") &&
      cards.includes("logoUrl={entry.logoUrl}") &&
      cards.includes("clubName={entry.clubName}") &&
      logo.includes("export function ParticipantClubLogo") &&
      logo.includes('title="Kein Logo"') &&
      logo.includes("object-contain") &&
      logo.includes("clubName.trim().slice(0, 1)"),
    "ParticipantClubLogo still used with existing fallback",
  );

  // 6–7 responsive grid
  assert(
    cards.includes("grid-cols-1") &&
      cards.includes("sm:grid-cols-2") &&
      /grid grid-cols-1/.test(cards),
    "participant grid is 1-col mobile / 2-col from sm+",
  );

  // 8 existing participant fields retained
  assert(
    cards.includes("entry.clubName") &&
      cards.includes("entry.teamName") &&
      cards.includes("entry.ageGroup") &&
      cards.includes("entry.birthYear") &&
      cards.includes("entry.groupName") &&
      cards.includes("entry.logoUrl") &&
      cards.includes("entry.applicationId"),
    "existing participant fields retained in cards",
  );

  // 9–13 no new query / search / filter / sort controls / pagination
  assert(
    !cards.includes("createClient") &&
      !cards.includes("supabase") &&
      !cards.includes("useQuery") &&
      !cards.includes("fetch(") &&
      !cards.includes('.from("') &&
      !stage.includes("searchParticipant") &&
      !stage.includes("participantFilter") &&
      !stage.includes("pagination") &&
      !cards.includes("pagination") &&
      !stage.includes("Alle Teams anzeigen") &&
      !/<input/.test(cards) &&
      !/<select/.test(cards),
    "no new participant query/search/filter/pagination",
  );

  // 14 empty-state semantics unchanged
  assert(
    stage.includes("Noch keine bestätigten Teams.") &&
      stage.includes('teilnehmerTab.source === "unavailable"') &&
      stage.includes(
        "Teilnehmer konnten aktuell nicht von MeinTurnierplan geladen werden.",
      ) &&
      /stage\.roster\.length === 0 \? \(/.test(stage),
    "empty-state semantics unchanged",
  );

  // 15 MTP resolver/source behavior unchanged
  assert(
    resolvers.includes("export function resolveGruppenTab") &&
      resolvers.includes("export function resolveSpielplanTab") &&
      resolvers.includes("export function resolveTabelleTab") &&
      stage.includes('teilnehmerTab.source === "mein-turnierplan"') &&
      stage.includes("mtp.participants.map") &&
      !cards.includes("mein-turnierplan") &&
      !cards.includes("resolveTeilnehmerTab"),
    "MTP participant path / resolvers unchanged; cards are hub-only",
  );

  // 16 Übersicht semantics unchanged (page overview list untouched)
  assert(
    page.includes("Teilnehmende Teams") &&
      page.includes("stage.roster.map((entry)") &&
      page.includes("<ParticipantClubLogo") &&
      page.includes("publicTeamLabel(entry.clubName, entry.teamName)") &&
      page.includes("sm:grid-cols-2"),
    "Übersicht participant preview semantics unchanged",
  );

  // 17–21 other tabs unchanged
  assert(
    stage.includes("resolveGruppenTab") &&
      (stage.includes("Noch keine Teams zugeordnet.") ||
        cardsGroup.includes("Noch keine Teams zugeordnet.")) &&
      stage.includes("Der Spielplan wird noch veröffentlicht.") &&
      stage.includes("<TournamentStandingsSection") &&
      stage.includes("PublicRoundCard") &&
      stage.includes("<MeinTurnierplanLiveSection") &&
      stage.includes('current === "gruppen"') &&
      stage.includes('current === "spielplan"') &&
      stage.includes('current === "tabelle"') &&
      stage.includes('current === "ko-runde"') &&
      stage.includes('current === "live"'),
    "Gruppen/Spielplan/Tabelle/KO/Live content paths retained",
  );

  // 22 V2-B1 tab chrome unchanged
  assert(
    stage.includes("Turnier-Center") &&
      stage.includes("bg-brand-yellow") &&
      stage.includes('aria-label="Turnierbereiche"') &&
      stage.includes('aria-current={active ? "page" : undefined}') &&
      stage.includes("overflow-x-auto") &&
      stage.includes("flex-nowrap") &&
      stage.includes("focus-visible:outline-brand-yellow") &&
      !stage.includes('role="tablist"'),
    "V2-B1 tab chrome unchanged",
  );

  // 23 V2-A unchanged
  assert(
    page.includes("<TournamentHero") &&
      page.includes("<TournamentInfoGrid") &&
      page.includes("<TournamentPartnersSection") &&
      hero.includes("TournamentImageFrame") &&
      infoGrid.includes("Turnierinfos") &&
      description.includes("Beschreibung") &&
      extraInfo.includes("items.map") &&
      partners.includes('size="tournament"'),
    "V2-A components unchanged",
  );

  // optional count uses rendered roster length only
  assert(
    stage.includes('teilnehmerTab.source === "hub" && stage.roster.length > 0') &&
      stage.includes("{stage.roster.length}") &&
      !stage.includes("maxTeams") &&
      !stage.includes("confirmedTeams"),
    "participant count uses rendered roster.length only (hub path)",
  );

  // cards are presentational only
  assert(
    cards.includes("TournamentParticipantCardsProps") &&
      cards.includes("roster: PublicRosterEntry[]") &&
      !cards.includes("createClient") &&
      !cards.includes("getPublic"),
    "cards component is presentational (props-only)",
  );

  // shared StandingsTable / ParticipantClubLogo not redesigned for B2
  assert(
    standings.includes("export function StandingsTable") &&
      logo.includes("export function ParticipantClubLogo") &&
      logo.includes("LIVE_LOGO_SIZE"),
    "shared StandingsTable and ParticipantClubLogo remain present",
  );

  // 24 no backend/db/RPC/RLS/RBAC
  assert(
    migrationFiles.filter((name) => /partner/i.test(name)).length === 3,
    "no new migrations",
  );
  assert(
    !cards.includes("service_role") &&
      !cards.includes('.from("') &&
      !stage.includes("service_role"),
    "no backend/db access in B2 presentation",
  );

  return "ok";
}
