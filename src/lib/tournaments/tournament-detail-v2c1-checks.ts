import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2c1-checks: ${message}`);
  }
}

/**
 * Structural checks for Tournament Detail V2-C1
 * (modern Gruppen cards only).
 */
export function runTournamentDetailV2C1Checks() {
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const groupCards = read(
    "src/components/tournaments/TournamentGroupCards.tsx",
  );
  const participantCards = read(
    "src/components/tournaments/TournamentParticipantCards.tsx",
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

  // dedicated presentational component
  assert(
    groupCards.includes("export function TournamentGroupCards") &&
      stage.includes("<TournamentGroupCards") &&
      groupCards.includes('source: "hub"') &&
      groupCards.includes('source: "mtp"'),
    "dedicated TournamentGroupCards presentational component exists",
  );

  // responsive grid
  assert(
    groupCards.includes("grid-cols-1") &&
      groupCards.includes("sm:grid-cols-2") &&
      /grid grid-cols-1/.test(groupCards),
    "responsive group grid 1-col mobile / 2-col from sm+",
  );

  // Hub filter + order preserved in Stage (no sort)
  assert(
    stage.includes("stage.roster.filter((entry) => entry.groupId === group.id)") &&
      stage.includes("stage.groups.map((group)") &&
      !stage.includes("groups.sort") &&
      !stage.includes("roster.sort") &&
      !groupCards.includes(".sort("),
    "Hub group/member order not sorted; filter semantics retained in Stage",
  );

  // MTP order preserved
  assert(
    stage.includes('source="mtp"') &&
      stage.includes("mtp.groups.map((group)") &&
      groupCards.includes("group.teams.map") &&
      !groupCards.includes("teams.sort") &&
      !groupCards.includes("groups.sort"),
    "MTP group/team order not sorted",
  );

  // Hub publicTeamLabel preserved
  assert(
    names.includes("export function publicTeamLabel") &&
      groupCards.includes("publicTeamLabel(entry.clubName, entry.teamName)") &&
      !groupCards.includes("hasDistinctTeamName"),
    "Hub publicTeamLabel semantics preserved in group rows",
  );

  // MTP raw team.name
  assert(
    groupCards.includes("{team.name}") &&
      /MtpGroupCard[\s\S]*\{team\.name\}/.test(groupCards),
    "MTP team.name semantics preserved (not publicTeamLabel)",
  );

  // ParticipantClubLogo reused, source unchanged
  assert(
    groupCards.includes("<ParticipantClubLogo") &&
      groupCards.includes("logoUrl={entry.logoUrl}") &&
      groupCards.includes("logoUrl={team.logoUrl}") &&
      logo.includes("export function ParticipantClubLogo") &&
      logo.includes('title="Kein Logo"') &&
      logo.includes("object-contain") &&
      logo.includes("clubName.trim().slice(0, 1)"),
    "ParticipantClubLogo reused with existing fallback; logo source intact",
  );

  // B2 participant cards unchanged markers
  assert(
    participantCards.includes("export function TournamentParticipantCards") &&
      participantCards.includes("PublicRosterEntry") &&
      participantCards.includes("sm:grid-cols-2") &&
      !participantCards.includes("TournamentGroupCards") &&
      !participantCards.includes("source: \"mtp\""),
    "TournamentParticipantCards source unchanged / not generalized",
  );

  // empty + unavailable semantics
  assert(
    groupCards.includes("Noch keine Teams zugeordnet.") &&
      stage.includes(
        "Gruppen konnten aktuell nicht von MeinTurnierplan geladen werden.",
      ) &&
      stage.includes('gruppenTab.source === "unavailable"'),
    "empty group and MTP unavailable semantics preserved",
  );

  // no new queries in presentation
  assert(
    !groupCards.includes("createClient") &&
      !groupCards.includes("supabase") &&
      !groupCards.includes("useQuery") &&
      !groupCards.includes("fetch(") &&
      !groupCards.includes('.from("') &&
      !groupCards.includes("resolveGruppenTab"),
    "no new participant/group query in group cards",
  );

  // resolveGruppenTab / preferSyncedHub unchanged
  assert(
    resolvers.includes("export function resolveGruppenTab") &&
      /if \(input\.preferSyncedHub && input\.hubGroupCount > 0\)/.test(resolvers) &&
      stage.includes("resolveGruppenTab({") &&
      stage.includes("hubGroupCount: stage.groups.length") &&
      stage.includes("preferSyncedHub: preferSyncedHubData"),
    "resolveGruppenTab + preferSyncedHubData wiring unchanged",
  );

  // counts from rendered arrays only
  assert(
    groupCards.includes("group.members.length") &&
      groupCards.includes("group.teams.length") &&
      groupCards.includes("groups.length") &&
      !groupCards.includes("maxTeams") &&
      !groupCards.includes("confirmedTeams") &&
      !stage.includes("maxTeams"),
    "group/team counts from rendered arrays only",
  );

  // B1 tab chrome freeze
  assert(
    stage.includes("Turnier-Center") &&
      stage.includes('id: "gruppen"') &&
      stage.includes('label: "Gruppen"') &&
      stage.includes('aria-label="Turnierbereiche"') &&
      stage.includes('aria-current={active ? "page" : undefined}') &&
      stage.includes("overflow-x-auto") &&
      stage.includes("flex-nowrap") &&
      !stage.includes('role="tablist"'),
    "B1 tabs / Turnier-Center chrome unchanged",
  );

  // other tabs freeze
  assert(
    stage.includes("<TournamentParticipantCards roster={stage.roster} />") &&
      stage.includes('current === "spielplan"') &&
      stage.includes("<TournamentStandingsSection") &&
      stage.includes("PublicRoundCard") &&
      stage.includes("<MeinTurnierplanLiveSection") &&
      standings.includes("export function StandingsTable"),
    "Teilnehmer/Spielplan/Tabelle/KO/Live paths retained",
  );

  // V2-A freeze
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

  // no backend/db
  assert(
    migrationFiles.filter((name) => /partner/i.test(name)).length === 3,
    "no new migrations",
  );
  assert(
    !groupCards.includes("service_role") &&
      !groupCards.includes('.from("') &&
      !stage.includes("service_role"),
    "no backend/db access in C1 presentation",
  );

  return "ok";
}
