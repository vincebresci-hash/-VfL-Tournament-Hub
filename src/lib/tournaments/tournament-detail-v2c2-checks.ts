import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2c2-checks: ${message}`);
  }
}

/**
 * Structural checks for Tournament Detail V2-C2
 * (modern Hub Spielplan presentation only).
 */
export function runTournamentDetailV2C2Checks() {
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const schedule = read(
    "src/components/tournaments/TournamentScheduleCards.tsx",
  );
  const groupCards = read(
    "src/components/tournaments/TournamentGroupCards.tsx",
  );
  const participantCards = read(
    "src/components/tournaments/TournamentParticipantCards.tsx",
  );
  const page = read("src/app/turniere/[slug]/page.tsx");
  const resolvers = read("src/lib/mein-turnierplan-public-source.ts");
  const datetime = read("src/lib/schedule/datetime.ts");
  const names = read("src/lib/schedule/names.ts");
  const standings = read("src/components/tournaments/StandingsTable.tsx");
  const logo = read("src/components/tournaments/ParticipantClubLogo.tsx");
  const mtpWidget = read("src/components/tournaments/MeinTurnierplanWidget.tsx");
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
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert(
    schedule.includes("export function TournamentScheduleCards") &&
      stage.includes("<TournamentScheduleCards") &&
      stage.includes("matches={stage.matches}"),
    "dedicated Hub schedule presentation component wired to stage.matches",
  );

  assert(
    schedule.includes("grid-cols-1") &&
      !schedule.includes("sm:grid-cols-2") &&
      !schedule.includes("md:grid-cols-2"),
    "Hub Spielplan remains single-column (no 2-col grid)",
  );

  assert(
    !schedule.includes(".sort(") &&
      !schedule.includes(".toSorted(") &&
      !schedule.includes("groupBy") &&
      schedule.includes("matches.map((match)") &&
      !stage.includes("stage.matches.sort") &&
      !stage.includes("[...stage.matches].sort"),
    "no sorting / regrouping in Hub schedule presenter",
  );

  assert(
    stage.includes("resolveSpielplanTab({") &&
      stage.includes("hubMatchCount: stage.matches.length") &&
      stage.includes("preferSyncedHub: preferSyncedHubData") &&
      resolvers.includes("export function resolveSpielplanTab") &&
      /if \(input\.preferSyncedHub && input\.hubMatchCount > 0\)/.test(resolvers) &&
      /input\.mtp\.matchesWidgetUrl/.test(resolvers),
    "resolveSpielplanTab + preferSyncedHubData semantics unchanged",
  );

  assert(
    stage.includes('iframeId="widgetMatches"') &&
      stage.includes("<MeinTurnierplanWidget") &&
      stage.includes('spielplanTab.source === "mein-turnierplan"') &&
      mtpWidget.includes("export function MeinTurnierplanWidget") &&
      !schedule.includes("MeinTurnierplanWidget") &&
      !schedule.includes("matchesWidgetUrl"),
    "MTP widget path unchanged; schedule cards are Hub-only",
  );

  assert(
    names.includes("export function publicTeamLabel") &&
      names.includes("export function teamLabel") &&
      schedule.includes("teamLabel(") &&
      stage.includes("publicTeamLabel(entry.clubName, entry.teamName)") &&
      names.includes('fallback = "steht noch nicht fest"'),
    "team label / publicTeamLabel / steht noch nicht fest fallback preserved",
  );

  assert(
    datetime.includes("export function formatBerlinClock") &&
      schedule.includes("formatBerlinClock(match.scheduledAt)") &&
      datetime.includes('return "—";') &&
      datetime.includes("Uhr"),
    "formatBerlinClock unchanged and used for kickoff display",
  );

  assert(
    stage.includes("groupName(match.groupId)") &&
      stage.includes("fieldName") &&
      stage.includes('?? "Feld"') &&
      stage.includes("knockoutRoundLabel[match.round]") &&
      schedule.includes("phaseOrGroupLabel(match)") &&
      schedule.includes("fieldLabel(match.fieldId)"),
    "group/round/field label wiring preserved",
  );

  assert(
    schedule.includes('match.status === "completed"') &&
      schedule.includes("match.homeScore != null") &&
      schedule.includes("match.awayScore != null") &&
      schedule.includes("Ergebnis folgt") &&
      schedule.includes('match.decidedBy === "penalties"') &&
      schedule.includes("n.E.") &&
      schedule.includes("homePenalties") &&
      schedule.includes("awayPenalties"),
    "completed-score gate, Ergebnis folgt, and penalty semantics preserved",
  );

  // 0:0 remains valid completed score (gate uses != null, not truthy)
  assert(
    /match\.homeScore != null/.test(schedule) &&
      /match\.awayScore != null/.test(schedule) &&
      !/match\.homeScore\s*&&/.test(schedule) &&
      !/Boolean\(match\.homeScore\)/.test(schedule),
    "0:0 remains valid completed score (null checks, not truthiness)",
  );

  assert(
    stage.includes("Der Spielplan wird noch veröffentlicht.") &&
      stage.includes(
        "Der Spielplan ist aktuell nicht verfügbar. Bitte prüfen Sie später erneut",
      ) &&
      stage.includes("publicScheduleNote") &&
      stage.includes("<MeinTurnierplanPublicButton"),
    "Hub empty, MTP unavailable, and publicScheduleNote semantics preserved",
  );

  assert(
    stage.includes("matches={stage.matches}") &&
      !schedule.includes('phase !== "knockout"') &&
      !schedule.includes('phase === "group"') &&
      !stage.includes("matches={groupMatches}") &&
      !stage.includes("matches={knockoutMatches}"),
    "KO matches not filtered out of Spielplan Hub list (full stage.matches)",
  );

  assert(
    !schedule.includes("ParticipantClubLogo") &&
      !schedule.includes("logoUrl") &&
      logo.includes("export function ParticipantClubLogo"),
    "no new Spielplan logo behavior; ParticipantClubLogo untouched",
  );

  assert(
    !schedule.includes("createClient") &&
      !schedule.includes("supabase") &&
      !schedule.includes("fetch(") &&
      !schedule.includes('.from("') &&
      !schedule.includes("resolveSpielplanTab"),
    "no new query / source selection in schedule cards",
  );

  assert(
    groupCards.includes("export function TournamentGroupCards") &&
      participantCards.includes("export function TournamentParticipantCards") &&
      stage.includes("<TournamentGroupCards") &&
      stage.includes("<TournamentParticipantCards roster={stage.roster} />") &&
      stage.includes("Turnier-Center") &&
      stage.includes('aria-label="Turnierbereiche"'),
    "V2-A/B1/B2/C1 surfaces retained / not redesigned here",
  );

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

  assert(
    stage.includes('current === "tabelle"') &&
      stage.includes("<TournamentStandingsSection") &&
      stage.includes("computeGroupStandings") &&
      stage.includes("TournamentKnockoutRounds") &&
      stage.includes("<MeinTurnierplanLiveSection") &&
      standings.includes("export function StandingsTable"),
    "other tabs / StandingsTable / Live / KO paths retained",
  );

  assert(
    schedule.includes("matches.length") &&
      schedule.includes("Spiele") &&
      !schedule.includes("maxTeams") &&
      !stage.includes("expectedMatches"),
    "match count from rendered matches array only",
  );

  assert(
    migrationFiles.filter((name) => /partner/i.test(name)).length === 3,
    "no new migrations",
  );
  assert(
    !schedule.includes("service_role") && !stage.includes("service_role"),
    "no backend/db access in C2 presentation",
  );

  return "ok";
}
