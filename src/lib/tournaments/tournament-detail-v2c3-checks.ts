import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeGroupStandings } from "@/lib/schedule/standings";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2c3-checks: ${message}`);
  }
}

/**
 * Structural checks for Tournament Detail V2-C3
 * (public Hub Tabelle presentation only).
 */
export function runTournamentDetailV2C3Checks() {
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const section = read("src/components/tournaments/TournamentStandingsSection.tsx");
  const standingsTable = read("src/components/tournaments/StandingsTable.tsx");
  const standings = read("src/lib/schedule/standings.ts");
  const resolvers = read("src/lib/mein-turnierplan-public-source.ts");
  const page = read("src/app/turniere/[slug]/page.tsx");
  const admin = read("src/components/admin/TournamentResultsBoard.tsx");
  const widget = read("src/components/tournaments/MeinTurnierplanWidget.tsx");
  const schedule = read("src/components/tournaments/TournamentScheduleCards.tsx");
  const groupCards = read("src/components/tournaments/TournamentGroupCards.tsx");
  const participantCards = read(
    "src/components/tournaments/TournamentParticipantCards.tsx",
  );
  const hero = read("src/components/tournaments/TournamentHero.tsx");
  const names = read("src/lib/schedule/names.ts");
  const logo = read("src/components/tournaments/ParticipantClubLogo.tsx");
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert(
    section.includes("export function TournamentStandingsSection") &&
      stage.includes("<TournamentStandingsSection") &&
      stage.includes("standings: computeGroupStandings(") &&
      stage.includes("groups={stage.groups.map((group) => {") &&
      stage.includes("teamLabels={teamLabels}") &&
      stage.includes("teamMarks={teamMarks}"),
    "public Hub Tabelle uses presentational section with precomputed standings",
  );

  assert(
    !stage.includes("<StandingsTable") &&
      standingsTable.includes("export function StandingsTable") &&
      admin.includes("<StandingsTable") &&
      admin.includes("computeGroupStandings(") &&
      !admin.includes("TournamentStandingsSection"),
    "shared StandingsTable remains the admin renderer",
  );

  assert(
    !section.includes("computeGroupStandings") &&
      !section.includes("compareStandings") &&
      !section.includes("defaultTieBreakers") &&
      !section.includes(".sort(") &&
      !section.includes(".toSorted(") &&
      !section.includes("status ===") &&
      !section.includes("phase") &&
      !section.includes("createClient") &&
      !section.includes("supabase") &&
      !section.includes(".from(") &&
      !section.includes("rpc("),
    "presentation does not calculate, sort, filter matches, or query",
  );

  assert(
    section.includes(">Pl<") &&
      section.includes(">Team<") &&
      section.includes(">Sp<") &&
      section.includes(">S<") &&
      section.includes(">U<") &&
      section.includes(">N<") &&
      section.includes(">Tore<") &&
      section.includes(">Diff<") &&
      section.includes(">Pkt<") &&
      section.includes("scope=\"col\"") &&
      section.includes("aria-labelledby={headingId}") &&
      section.includes("<caption") &&
      section.includes("<table") &&
      section.includes("<thead") &&
      section.includes("<tbody") &&
      section.includes("overflow-x-auto") &&
      section.includes("min-w-[40rem]"),
    "semantic 9-column table with group labelling and horizontal scroll",
  );

  assert(
    section.includes('teamLabels[row.applicationId] ?? "Team"') &&
      !section.includes("steht noch nicht fest") &&
      names.includes("export function publicTeamLabel") &&
      stage.includes("publicTeamLabel(entry.clubName, entry.teamName)"),
    "team labels stay on publicTeamLabel with Team fallback",
  );

  assert(
    section.includes("formatGoals(row.goalsFor, row.goalsAgainst)") &&
      section.includes("row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff") &&
      section.includes("{row.points}") &&
      section.includes("{row.rank}") &&
      section.includes("{row.played}") &&
      section.includes("{row.won}") &&
      section.includes("{row.drawn}") &&
      section.includes("{row.lost}") &&
      standings.includes("export function formatGoals") &&
      standings.includes("return `${goalsFor}:${goalsAgainst}`;"),
    "goals, diff prefix, and points render existing row fields",
  );

  assert(
    section.includes("group.standings.map((row)") &&
      section.includes("{group.name}") &&
      section.includes("groups.length") &&
      section.includes("group.standings.length") &&
      !section.includes("maxTeams") &&
      !section.includes("Noch keine Teams") &&
      section.includes("if (groups.length === 0)") &&
      section.includes("return null"),
    "counts come from rendered arrays; empty group list stays silent",
  );

  assert(
    section.includes("ParticipantClubLogo") &&
      section.includes("logoUrl={mark.logoUrl}") &&
      section.includes("teamMarks?.[row.applicationId]") &&
      !section.includes("createClient") &&
      logo.includes("export function ParticipantClubLogo"),
    "logos are an optional roster lookup, not a new query",
  );

  assert(
    standings.includes(
      'return status === "completed" && homeScore != null && awayScore != null;',
    ) &&
      standings.includes("home.points += 3") &&
      standings.includes("away.points += 3") &&
      standings.includes("home.points += 1") &&
      standings.includes("away.points += 1") &&
      standings.includes("home.drawn += 1") &&
      standings.includes("row.goalDiff = row.goalsFor - row.goalsAgainst") &&
      standings.includes("(a, b) => b.points - a.points") &&
      standings.includes("(a, b) => b.goalDiff - a.goalDiff") &&
      standings.includes("(a, b) => b.goalsFor - a.goalsFor") &&
      standings.includes("a.applicationId.localeCompare(b.applicationId)") &&
      standings.includes("rank: index + 1"),
    "computeGroupStandings gate, points, and tiebreak order unchanged",
  );

  const draw = computeGroupStandings(
    ["home", "away"],
    [
      {
        homeApplicationId: "home",
        awayApplicationId: "away",
        homeScore: 0,
        awayScore: 0,
        status: "completed",
      },
    ],
  );
  assert(
    draw.every(
      (row) =>
        row.played === 1 &&
        row.drawn === 1 &&
        row.won === 0 &&
        row.lost === 0 &&
        row.goalsFor === 0 &&
        row.goalsAgainst === 0 &&
        row.goalDiff === 0 &&
        row.points === 1,
    ),
    "completed 0:0 remains a 1-point draw",
  );

  const win = computeGroupStandings(
    ["home", "away"],
    [
      {
        homeApplicationId: "home",
        awayApplicationId: "away",
        homeScore: 2,
        awayScore: 0,
        status: "completed",
      },
    ],
  );
  const winner = win.find((row) => row.applicationId === "home");
  const loser = win.find((row) => row.applicationId === "away");
  assert(
    winner?.points === 3 &&
      winner.won === 1 &&
      winner.goalDiff === 2 &&
      loser?.points === 0 &&
      loser.lost === 1 &&
      win[0]?.applicationId === "home",
    "completed win remains 3 points and ranks first",
  );

  const ignored = computeGroupStandings(
    ["home", "away"],
    [
      {
        homeApplicationId: "home",
        awayApplicationId: "away",
        homeScore: 0,
        awayScore: 0,
        status: "scheduled",
      },
      {
        homeApplicationId: "home",
        awayApplicationId: "away",
        homeScore: null,
        awayScore: null,
        status: "completed",
      },
    ],
  );
  assert(
    ignored.every((row) => row.played === 0 && row.points === 0),
    "non-completed and null scores do not enter the table",
  );

  const tied = computeGroupStandings(["b-id", "a-id"], []);
  assert(
    tied[0]?.applicationId === "a-id" &&
      tied[1]?.applicationId === "b-id" &&
      tied.every((row) => row.played === 0 && row.points === 0 && row.rank > 0),
    "all-zero rows stay visible and follow applicationId tiebreak",
  );

  assert(
    stage.includes('const groupMatches = stage.matches.filter((match) => match.phase !== "knockout")') &&
      stage.includes("groupMatches.filter((match) => match.groupId === group.id)"),
    "public Tabelle still excludes knockout matches before standings",
  );

  assert(
    resolvers.includes("export function resolveTabelleTab") &&
      resolvers.includes("input.mtp.tableWidgetUrl") &&
      resolvers.includes(
        "if (input.preferSyncedHub && (input.hubGroupCount > 0 || (input.hubMatchCount ?? 0) > 0))",
      ) &&
      stage.includes("resolveTabelleTab({") &&
      stage.includes("preferSyncedHub: preferSyncedHubData") &&
      page.includes("preferSyncedHubData={Boolean(") &&
      page.includes("tournament.meinTurnierplanLastSyncedAt"),
    "resolveTabelleTab and preferSyncedHubData unchanged",
  );

  assert(
    stage.includes('iframeId="widgetTable"') &&
      stage.includes('title="MeinTurnierplan Tabelle"') &&
      stage.includes("<MeinTurnierplanWidget") &&
      stage.includes("<MeinTurnierplanSourceHint />") &&
      stage.includes("<MeinTurnierplanPublicButton") &&
      stage.includes("Die Tabelle ist aktuell nicht verfügbar.") &&
      widget.includes("<iframe") &&
      widget.includes("meinTurnierplanIframeSrc"),
    "MTP Tabelle iframe and unavailable copy unchanged",
  );

  assert(
    schedule.includes("export function TournamentScheduleCards") &&
      stage.includes("<TournamentScheduleCards") &&
      groupCards.includes("export function TournamentGroupCards") &&
      stage.includes("<TournamentGroupCards") &&
      participantCards.includes("export function TournamentParticipantCards") &&
      stage.includes("<TournamentParticipantCards") &&
      hero.includes("export function TournamentHero") &&
      stage.includes("Turnier-Center") &&
      stage.includes("TournamentKnockoutRounds") &&
      stage.includes("<MeinTurnierplanLiveSection"),
    "V2-A/B1/B2/C1/C2 and other tabs not redesigned here",
  );

  assert(
    standingsTable.includes(">Pl<") &&
      standingsTable.includes("teamLabels[row.applicationId] ?? \"Team\"") &&
      standingsTable.includes("formatGoals(row.goalsFor, row.goalsAgainst)") &&
      !standingsTable.includes("TournamentStandingsSection"),
    "StandingsTable file remains the previous renderer",
  );

  assert(
    migrationFiles.filter((name) => /partner/i.test(name)).length === 3,
    "no new migrations",
  );
  assert(
    !section.includes("service_role") && !stage.includes("service_role"),
    "no backend/db access in C3 presentation",
  );

  return "ok";
}
