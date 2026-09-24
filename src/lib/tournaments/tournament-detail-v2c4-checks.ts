import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeKnockoutPlacements,
  knockoutRoundLabel,
  resolveKnockoutOutcome,
} from "@/lib/schedule/knockout";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-detail-v2c4-checks: ${message}`);
  }
}

type ResultMatch = {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  decidedBy: string | null;
  homePenalties: number | null;
  awayPenalties: number | null;
};

/**
 * Structural checks for Tournament Detail V2-C4
 * (public Hub KO-Runde presentation only).
 */
export function runTournamentDetailV2C4Checks() {
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const presenter = read("src/components/tournaments/TournamentKnockoutRounds.tsx");
  const names = read("src/lib/schedule/names.ts");
  const datetime = read("src/lib/schedule/datetime.ts");
  const knockout = read("src/lib/schedule/knockout.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const standings = read("src/lib/schedule/standings.ts");
  const livePage = read("src/components/live/LivePageView.tsx");
  const adminKo = read("src/components/admin/TournamentKnockoutBoard.tsx");
  const adminResults = read("src/components/admin/TournamentResultsBoard.tsx");
  const liveSection = read("src/components/tournaments/MeinTurnierplanLiveSection.tsx");
  const liveWidget = read("src/components/tournaments/MeinTurnierplanWidget.tsx");
  const liveRender = read("src/lib/mein-turnierplan-live-render.ts");
  const logo = read("src/components/tournaments/ParticipantClubLogo.tsx");
  const participants = read("src/components/tournaments/TournamentParticipantCards.tsx");
  const groups = read("src/components/tournaments/TournamentGroupCards.tsx");
  const schedule = read("src/components/tournaments/TournamentScheduleCards.tsx");
  const table = read("src/components/tournaments/TournamentStandingsSection.tsx");
  const migrationFiles = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const sideStart = stage.indexOf("const knockoutTeamSide");
  const roundsStart = stage.indexOf("const knockoutRoundViews");
  const placementsStart = stage.indexOf("const knockoutPlacementViews");
  const resultStart = stage.indexOf("function knockoutResultText");
  const overviewPlacements = stage.indexOf("function PublicPlacements");
  assert(sideStart >= 0 && roundsStart > sideStart, "KO side preparation stays in the stage");
  assert(placementsStart > roundsStart && resultStart > 0, "KO view preparation stays in the stage");
  assert(overviewPlacements > resultStart, "Übersicht placement renderer remains");

  const sideFn = stage.slice(sideStart, roundsStart);
  const roundFn = stage.slice(roundsStart, placementsStart);
  const placementFn = stage.slice(placementsStart, stage.indexOf("return ("));
  const resultFn = stage.slice(resultStart, overviewPlacements);

  assert(
    stage.includes('stage.matches.filter((match) => match.phase === "knockout")') &&
      stage.includes('item.id !== "ko-runde" || knockoutMatches.length > 0') &&
      stage.includes('requested === "ko-runde" && knockoutMatches.length === 0'),
    "KO filter and tab visibility unchanged",
  );

  assert(
    stage.includes('["quarterfinal"]') &&
      stage.includes('["semifinal"]') &&
      stage.includes('["final", "third-place"]') &&
      stage.includes('["placement-5", "placement-7"]') &&
      roundFn.includes("...publicRounds.flat(), ...publicPlacements") &&
      !roundFn.includes(".sort(") &&
      !placementFn.includes(".sort(") &&
      !presenter.includes(".sort(") &&
      !presenter.includes(".toSorted("),
    "supported round order unchanged and presenter does not sort",
  );

  assert(
    roundFn.includes("knockoutMatches.filter((match) => match.round === round)") &&
      roundFn.includes("if (roundMatches.length === 0)") &&
      roundFn.includes("return [];") &&
      roundFn.includes("roundMatches.map((match)") &&
      !roundFn.includes(".sort("),
    "empty rounds omitted and match filter order preserved",
  );

  assert(
    names.includes('fallback = "steht noch nicht fest"') &&
      sideFn.includes("teamLabel(teamLabels, participantId)") &&
      sideFn.includes("participantId ? teamMarks[participantId]") &&
      roundFn.includes(
        "matchTeamId(match.homeApplicationId, match.homeExternalTeamId)",
      ) &&
      roundFn.includes(
        "matchTeamId(match.awayApplicationId, match.awayExternalTeamId)",
      ) &&
      stage.includes(
        "const matchTeamId = (applicationId: string | null, externalTeamId?: string | null) =>",
      ) &&
      stage.includes("applicationId ?? externalTeamId ?? null") &&
      stage.includes("teamLabels[entry.externalTeamId]") &&
      stage.includes("teamMarks[entry.externalTeamId]") &&
      roundFn.includes("`Gewinner ${teamLabel(teamLabels, outcome.winnerId)}`") &&
      placementFn.includes("teamLabel(teamLabels, row.applicationId)"),
    "KO sides resolve via matchTeamId for application/external labels, logos, winner, placements",
  );

  assert(
    datetime.includes("export function formatBerlinClock") &&
      datetime.includes('return "—";') &&
      datetime.includes("Uhr") &&
      roundFn.includes("formatBerlinClock(match.scheduledAt)") &&
      stage.includes('?? "Feld"') &&
      roundFn.includes("fieldName(match.fieldId)"),
    "time and field fallbacks unchanged",
  );

  assert(
    resultFn.includes('match.status === "completed"') &&
      resultFn.includes("match.homeScore != null") &&
      resultFn.includes("match.awayScore != null") &&
      resultFn.includes("${match.homeScore}:${match.awayScore}") &&
      resultFn.includes('match.decidedBy === "penalties"') &&
      resultFn.includes("` n.E. ${match.homePenalties ?? 0}:${match.awayPenalties ?? 0}`") &&
      resultFn.includes('return "Ergebnis folgt"') &&
      !/homeScore\s*&&/.test(resultFn) &&
      !/awayScore\s*&&/.test(resultFn) &&
      !resultFn.includes("Boolean(match.homeScore)"),
    "completed result, 0:0, and penalty text stay in the stage",
  );

  const resultJs = resultFn.replace(
    /function knockoutResultText\(match: \{[\s\S]*?\}\)/,
    "function knockoutResultText(match)",
  );
  const knockoutResultText = new Function(
    `${resultJs}\nreturn knockoutResultText;`,
  )() as (match: ResultMatch) => string;
  const pending = {
    decidedBy: null,
    homePenalties: null,
    awayPenalties: null,
  };
  assert(
    knockoutResultText({
      status: "completed",
      homeScore: 0,
      awayScore: 0,
      ...pending,
    }) === "0:0",
    "completed 0:0 displays 0:0",
  );
  assert(
    knockoutResultText({
      status: "completed",
      homeScore: 2,
      awayScore: 1,
      ...pending,
    }) === "2:1",
    "completed score text unchanged",
  );
  assert(
    knockoutResultText({
      status: "completed",
      homeScore: 1,
      awayScore: 1,
      decidedBy: "penalties",
      homePenalties: 5,
      awayPenalties: 4,
    }) === "1:1 n.E. 5:4",
    "penalty text remains n.E.",
  );
  assert(
    knockoutResultText({
      status: "completed",
      homeScore: 1,
      awayScore: 1,
      decidedBy: "penalties",
      homePenalties: null,
      awayPenalties: null,
    }) === "1:1 n.E. 0:0",
    "missing penalty scores stay zero",
  );
  for (const status of ["scheduled", "live", "cancelled"]) {
    assert(
      knockoutResultText({
        status,
        homeScore: 0,
        awayScore: 0,
        ...pending,
      }) === "Ergebnis folgt",
      `${status} result remains Ergebnis folgt`,
    );
  }
  assert(
    knockoutResultText({
      status: "completed",
      homeScore: null,
      awayScore: 0,
      ...pending,
    }) === "Ergebnis folgt",
    "null score remains Ergebnis folgt",
  );

  const decisive = resolveKnockoutOutcome({
    homeApplicationId: "home",
    awayApplicationId: "away",
    homeScore: 2,
    awayScore: 1,
    status: "completed",
    round: "final",
  });
  const drawn = resolveKnockoutOutcome({
    homeApplicationId: "home",
    awayApplicationId: "away",
    homeScore: 0,
    awayScore: 0,
    status: "completed",
    round: "final",
  });
  assert(decisive.winnerId === "home" && drawn.winnerId === null, "winner still comes from resolveKnockoutOutcome");
  assert(
    roundFn.includes("resolveKnockoutOutcome(match)") &&
      roundFn.includes("outcome.winnerId") &&
      roundFn.includes("`Gewinner ${teamLabel(teamLabels, outcome.winnerId)}`") &&
      !presenter.includes("resolveKnockoutOutcome") &&
      !presenter.includes("homeScore") &&
      !presenter.includes("winnerId"),
    "presenter renders the prepared winner and does not infer one",
  );

  const placed = computeKnockoutPlacements([
    {
      homeApplicationId: "final-home",
      awayApplicationId: "final-away",
      homeScore: 1,
      awayScore: 0,
      status: "completed",
      round: "final",
    },
    {
      homeApplicationId: "third-home",
      awayApplicationId: "third-away",
      homeScore: 2,
      awayScore: 0,
      status: "completed",
      round: "third-place",
    },
    {
      homeApplicationId: "p5-home",
      awayApplicationId: "p5-away",
      homeScore: 3,
      awayScore: 1,
      status: "completed",
      round: "placement-5",
    },
    {
      homeApplicationId: "p7-home",
      awayApplicationId: "p7-away",
      homeScore: 4,
      awayScore: 2,
      status: "completed",
      round: "placement-7",
    },
  ]);
  assert(
    placed.map((row) => row.place).join(",") === "1,2,3,4,5,6,7,8",
    "placement order preserved",
  );
  assert(
    placementFn.includes("placements.map((row)") &&
      !placementFn.includes(".sort(") &&
      presenter.includes("{row.place}. {row.label}") &&
      presenter.includes("Abschlussplatzierung"),
    "presenter keeps prepared placement order",
  );

  assert(
    knockoutRoundLabel.quarterfinal === "Viertelfinale" &&
      knockoutRoundLabel.semifinal === "Halbfinale" &&
      knockoutRoundLabel["third-place"] === "Spiel um Platz 3" &&
      knockoutRoundLabel.final === "Finale" &&
      knockoutRoundLabel["placement-5"] === "Spiel um Platz 5/6" &&
      knockoutRoundLabel["placement-7"] === "Spiel um Platz 7/8" &&
      roundFn.includes("knockoutRoundLabel[round]") &&
      !presenter.includes("knockoutRoundLabel"),
    "knockoutRoundLabel remains the only round-name mapping",
  );

  assert(
    presenter.includes("export function TournamentKnockoutRounds") &&
      presenter.includes("<ParticipantClubLogo") &&
      stage.includes("<TournamentKnockoutRounds") &&
      stage.includes("rounds={knockoutRoundViews}") &&
      stage.includes("placements={knockoutPlacementViews}") &&
      !stage.includes("matches={knockoutMatches}") &&
      presenter.includes("KO-Runde") &&
      presenter.includes("rounds.length") &&
      presenter.includes("round.matches.length"),
    "presenter mounts prepared display data and counts rendered arrays",
  );

  const forbidden = [
    "nextMatchId",
    "nextMatchSlot",
    "loserNextMatchId",
    "loserNextMatchSlot",
    "qualifyTopTwo",
    "isGroupStageComplete",
    "computeGroupStandings",
    "buildKnockoutPlan",
    "propagateKnockoutTeams",
    "manualOverride",
    "createClient",
    "supabase",
    "phase ===",
    "preferSyncedHub",
    "MeinTurnierplan",
    "LivePage",
    ".sort(",
    ".toSorted(",
  ];
  for (const token of forbidden) {
    assert(!presenter.includes(token), `presenter must not contain ${token}`);
  }

  assert(
    stage.includes('current === "uebersicht" && placements.length > 0') &&
      stage.includes("<PublicPlacements"),
    "Übersicht placement presentation unchanged",
  );

  for (const file of [
    knockout,
    knockoutActions,
    standings,
    adminKo,
    adminResults,
    liveSection,
    liveWidget,
    liveRender,
    logo,
    participants,
    groups,
    schedule,
    table,
  ]) {
    assert(!file.includes("TournamentKnockoutRounds"), "frozen files do not mount the KO presenter");
  }

  // C5B: LivePageView intentionally reuses TournamentKnockoutRounds for Hub-native /live.
  assert(
    livePage.includes("TournamentKnockoutRounds"),
    "LivePageView mounts Hub KO presenter (C5B)",
  );

  assert(
    migrationFiles.filter((name) => /partner/i.test(name)).length === 3,
    "no new migrations",
  );

  return "ok";
}
