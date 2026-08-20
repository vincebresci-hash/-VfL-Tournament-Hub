import { categoryRank, distributeTeams, groupSizeSpread } from "@/lib/schedule/distribute";
import {
  expectedGroupMatchCount,
  hasSelfPlay,
  roundRobinFixtures,
} from "@/lib/schedule/round-robin";
import { computeGroupStandings } from "@/lib/schedule/standings";
import { buildTimetable } from "@/lib/schedule/timetable";
import { berlinWallTimeToIso } from "@/lib/schedule/datetime";
import { canAccessAdmin } from "@/lib/auth/roles";
import {
  buildKnockoutPlan,
  computeKnockoutPlacements,
  hasDuplicateTeamInRound,
  isGroupStageComplete,
  propagateKnockoutTeams,
  qualifyTopTwo,
  resolveKnockoutOutcome,
  type KnockoutMatchLike,
} from "@/lib/schedule/knockout";
import type { PublicRosterEntry, StandingRow } from "@/types/schedule";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function rankRow(applicationId: string, rank: number): StandingRow {
  return {
    applicationId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    rank,
  };
}

export function runScheduleSelfChecks() {
  const eightTeams = Array.from({ length: 8 }, (_, index) => ({
    applicationId: `team-${index + 1}`,
    categoryRank: 0,
    internalStrength: 0,
    selfRatedStrength: 3,
  }));

  const twoGroups = distributeTeams(eightTeams, 2);
  assert(twoGroups.length === 2, "Zwei Gruppen erwartet");
  assert(twoGroups[0].length === 4 && twoGroups[1].length === 4, "Automatische Verteilung 4 + 4");
  assert(groupSizeSpread(twoGroups) <= 1, "Gruppendifferenz größer als 1");

  const tenTeams = Array.from({ length: 10 }, (_, index) => ({
    applicationId: `t-${index}`,
    categoryRank: 0,
    internalStrength: 0,
    selfRatedStrength: 3,
  }));
  const threeGroups = distributeTeams(tenTeams, 3);
  assert(groupSizeSpread(threeGroups) <= 1, "Ungerade Verteilung nicht ausgeglichen");

  const ranked = [
    { applicationId: "S", categoryRank: categoryRank("S"), internalStrength: 5, selfRatedStrength: 5 },
    { applicationId: "A", categoryRank: categoryRank("A"), internalStrength: 4, selfRatedStrength: 4 },
    { applicationId: "B", categoryRank: categoryRank("B"), internalStrength: 3, selfRatedStrength: 3 },
    { applicationId: "C", categoryRank: categoryRank("C"), internalStrength: 2, selfRatedStrength: 2 },
  ];
  const balanced = distributeTeams(ranked, 2, { balanceStrength: true });
  assert(balanced[0].includes("S") && balanced[0].includes("C"), "Snake-Draft Gruppe 1");
  assert(balanced[1].includes("A") && balanced[1].includes("B"), "Snake-Draft Gruppe 2");

  const four = ["a", "b", "c", "d"];
  const fixtures = roundRobinFixtures(four);
  assert(fixtures.length === expectedGroupMatchCount(4), "4 Teams ergeben 6 Spiele");
  assert(fixtures.length === 6, "Exakt 6 Gruppenspiele");
  assert(!hasSelfPlay(fixtures), "Keine Begegnung gegen sich selbst");
  const pairKeys = new Set(
    fixtures.map((fixture) => [fixture.homeId, fixture.awayId].sort().join("-")),
  );
  assert(pairKeys.size === 6, "Jede Paarung nur einmal");

  const start = new Date(berlinWallTimeToIso("2026-08-20", "09:00"));
  const timetable = buildTimetable(
    fixtures.map((fixture) => ({ ...fixture, groupId: "g1" })),
    [
      { id: "f1", name: "Feld 1" },
      { id: "f2", name: "Feld 2" },
    ],
    {
      start,
      durationMinutes: 12,
      breakMinutes: 3,
      minimumRestMinutes: 15,
    },
  );
  assert(timetable.matches.length === 6, "Zeitplan enthält alle Spiele");
  const fieldIds = new Set(timetable.matches.map((match) => match.fieldId));
  assert(fieldIds.size === 2, "Mehrere Spielfelder werden verteilt");

  const sourceGroup = twoGroups[0] ?? [];
  const targetGroup = twoGroups[1] ?? [];
  const switched = sourceGroup.pop();
  if (!switched) {
    throw new Error("Manueller Gruppenwechsel vorbereiten");
  }
  targetGroup.push(switched);
  assert(sourceGroup.length === 3 && targetGroup.length === 5, "Manueller Gruppenwechsel");

  const standings = computeGroupStandings(
    ["home", "away", "third"],
    [
      {
        homeApplicationId: "home",
        awayApplicationId: "away",
        homeScore: 3,
        awayScore: 1,
        status: "completed",
      },
      {
        homeApplicationId: "away",
        awayApplicationId: "third",
        homeScore: 2,
        awayScore: 2,
        status: "completed",
      },
      {
        homeApplicationId: "home",
        awayApplicationId: "third",
        homeScore: 0,
        awayScore: 1,
        status: "completed",
      },
    ],
  );

  const home = standings.find((row) => row.applicationId === "home");
  const away = standings.find((row) => row.applicationId === "away");
  const third = standings.find((row) => row.applicationId === "third");
  assert(home?.points === 3 && home.goalDiff === 1 && home.goalsFor === 3, "Heimpunkte/Tordifferenz");
  assert(away?.points === 1 && away.goalDiff === -2, "Unentschieden 1 Punkt");
  assert(third?.points === 4, "Auswärtssieg 3 plus Unentschieden 1");
  assert(standings[0].applicationId === "third", "Sortierung nach Punkten");

  const publicRoster: PublicRosterEntry = {
    applicationId: "app-1",
    clubName: "VfL Kirchheim",
    teamName: "U10",
    ageGroup: "U10",
    birthYear: 2016,
    groupId: "g1",
    groupName: "Gruppe A",
    groupSortOrder: 0,
  };
  const publicJson = JSON.stringify(publicRoster).toLowerCase();
  assert(!publicJson.includes("contact"), "Öffentliche Roster dürfen keine Kontaktdaten enthalten");
  assert(!publicJson.includes("email"), "Öffentliche Roster dürfen keine E-Mail enthalten");
  assert(!publicJson.includes("phone"), "Öffentliche Roster dürfen keine Telefonnummern enthalten");
  assert(!publicJson.includes("internal"), "Öffentliche Roster dürfen keine interne Bewertung enthalten");

  assert(!canAccessAdmin("club"), "Club darf KO-Spiele nicht verwalten");
  assert(canAccessAdmin("admin"), "Admin darf KO-Spiele verwalten");
  assert(canAccessAdmin("super-admin"), "Super-Admin darf KO-Spiele verwalten");

  const fourQualified = [
    { applicationId: "A1", groupIndex: 0, rank: 1, seedLabel: "A1" },
    { applicationId: "A2", groupIndex: 0, rank: 2, seedLabel: "A2" },
    { applicationId: "B1", groupIndex: 1, rank: 1, seedLabel: "B1" },
    { applicationId: "B2", groupIndex: 1, rank: 2, seedLabel: "B2" },
  ];
  const fourPlan = buildKnockoutPlan(
    {
      format: 4,
      includeThirdPlace: true,
      includePlacement5: false,
      includePlacement7: false,
    },
    fourQualified,
  );
  assert(!fourPlan.error, "4-Team-Plan darf nicht fehlschlagen");
  assert(fourPlan.matches.filter((match) => match.round === "semifinal").length === 2, "Zwei Halbfinals");
  assert(fourPlan.matches.some((match) => match.round === "final"), "Finale vorhanden");
  assert(fourPlan.matches.some((match) => match.round === "third-place"), "Spiel um Platz 3 vorhanden");
  assert(
    fourPlan.matches.find((match) => match.key === "sf1")?.homeId === "A1" &&
      fourPlan.matches.find((match) => match.key === "sf1")?.awayId === "B2",
    "HF1 A1 vs B2",
  );
  assert(
    fourPlan.matches.find((match) => match.key === "sf2")?.homeId === "B1" &&
      fourPlan.matches.find((match) => match.key === "sf2")?.awayId === "A2",
    "HF2 B1 vs A2",
  );

  const regularWin = resolveKnockoutOutcome(
    koMatch({
      homeApplicationId: "A1",
      awayApplicationId: "B2",
      homeScore: 2,
      awayScore: 1,
      status: "completed",
    }),
  );
  assert(regularWin.winnerId === "A1" && regularWin.loserId === "B2", "Ergebnis 2:1 bestimmt Sieger");

  const penaltyWin = resolveKnockoutOutcome(
    koMatch({
      homeApplicationId: "B1",
      awayApplicationId: "A2",
      homeScore: 1,
      awayScore: 1,
      status: "completed",
      decidedBy: "penalties",
      homePenalties: 5,
      awayPenalties: 4,
    }),
  );
  assert(penaltyWin.winnerId === "B1" && penaltyWin.loserId === "A2", "1:1 plus Elfmeterschießen 5:4");

  const draw = resolveKnockoutOutcome(
    koMatch({
      homeApplicationId: "A1",
      awayApplicationId: "B2",
      homeScore: 1,
      awayScore: 1,
      status: "completed",
    }),
  );
  assert(draw.error, "Unentschieden ohne Elfmeter ist ungültig");

  const fourLive = planToMatches(fourPlan.matches);
  const afterSf1 = completeAndPropagate(fourLive, "sf1", 2, 1);
  assert(afterSf1.find((match) => match.id === "final")?.homeApplicationId === "A1", "HF-Sieger 2:1 ins Finale");
  assert(afterSf1.find((match) => match.id === "third")?.homeApplicationId === "B2", "HF-Verlierer ins Spiel um Platz 3");

  const afterPenalties = completeAndPropagate(afterSf1, "sf2", 1, 1, {
    homePenalties: 5,
    awayPenalties: 4,
  });
  assert(
    afterPenalties.find((match) => match.id === "final")?.awayApplicationId === "B1",
    "Elfmeter-Sieger ins Finale",
  );
  assert(
    afterPenalties.find((match) => match.id === "third")?.awayApplicationId === "A2",
    "Elfmeter-Verlierer ins Spiel um Platz 3",
  );

  const afterChange = completeAndPropagate(afterPenalties, "sf1", 0, 3);
  assert(
    afterChange.find((match) => match.id === "final")?.homeApplicationId === "B2",
    "Ergebnisänderung aktualisiert Finale",
  );
  assert(
    afterChange.find((match) => match.id === "third")?.homeApplicationId === "A1",
    "Ergebnisänderung aktualisiert Platz 3",
  );
  assert(
    afterChange.find((match) => match.id === "final")?.status === "scheduled",
    "Folge-Ergebnis wird zurückgesetzt",
  );

  const eightQualified = [
    { applicationId: "A1", groupIndex: 0, rank: 1, seedLabel: "A1" },
    { applicationId: "A2", groupIndex: 0, rank: 2, seedLabel: "A2" },
    { applicationId: "B1", groupIndex: 1, rank: 1, seedLabel: "B1" },
    { applicationId: "B2", groupIndex: 1, rank: 2, seedLabel: "B2" },
    { applicationId: "C1", groupIndex: 2, rank: 1, seedLabel: "C1" },
    { applicationId: "C2", groupIndex: 2, rank: 2, seedLabel: "C2" },
    { applicationId: "D1", groupIndex: 3, rank: 1, seedLabel: "D1" },
    { applicationId: "D2", groupIndex: 3, rank: 2, seedLabel: "D2" },
  ];
  const eightPlan = buildKnockoutPlan(
    {
      format: 8,
      includeThirdPlace: true,
      includePlacement5: true,
      includePlacement7: true,
    },
    eightQualified,
  );
  assert(!eightPlan.error, "8-Team-Plan darf nicht fehlschlagen");
  assert(eightPlan.matches.filter((match) => match.round === "quarterfinal").length === 4, "Vier Viertelfinals");
  assert(eightPlan.matches.filter((match) => match.round === "semifinal").length === 2, "Zwei Halbfinals");
  assert(eightPlan.matches.find((match) => match.key === "qf1")?.homeId === "A1", "VF1 Heim A1");
  assert(eightPlan.matches.find((match) => match.key === "qf1")?.awayId === "B2", "VF1 Auswärts B2");
  assert(eightPlan.matches.find((match) => match.key === "qf2")?.homeId === "B1", "VF2 Heim B1");
  assert(eightPlan.matches.find((match) => match.key === "qf3")?.homeId === "C1", "VF3 Heim C1");
  assert(eightPlan.matches.find((match) => match.key === "qf4")?.homeId === "D1", "VF4 Heim D1");

  let eightLive = planToMatches(eightPlan.matches);
  eightLive = completeAndPropagate(eightLive, "qf1", 3, 0);
  eightLive = completeAndPropagate(eightLive, "qf2", 1, 0);
  eightLive = completeAndPropagate(eightLive, "qf3", 2, 1);
  eightLive = completeAndPropagate(eightLive, "qf4", 0, 1);
  assert(eightLive.find((match) => match.id === "sf1")?.homeApplicationId === "A1", "VF1-Sieger ins HF1");
  assert(eightLive.find((match) => match.id === "sf1")?.awayApplicationId === "B1", "VF2-Sieger ins HF1");
  assert(eightLive.find((match) => match.id === "sf2")?.homeApplicationId === "C1", "VF3-Sieger ins HF2");
  assert(eightLive.find((match) => match.id === "sf2")?.awayApplicationId === "C2", "VF4-Sieger ins HF2");

  eightLive = completeAndPropagate(eightLive, "sf1", 2, 1);
  eightLive = completeAndPropagate(eightLive, "sf2", 0, 1);
  eightLive = completeAndPropagate(eightLive, "final", 1, 0);
  eightLive = completeAndPropagate(eightLive, "third", 2, 0);
  eightLive = completeAndPropagate(eightLive, "p5", 1, 0);
  eightLive = completeAndPropagate(eightLive, "p7", 3, 2);

  const placements = computeKnockoutPlacements(eightLive);
  assert(placements.find((row) => row.place === 1)?.applicationId === "A1", "Turniersieger");
  assert(placements.find((row) => row.place === 2)?.applicationId === "C2", "Finalist");
  assert(placements.find((row) => row.place === 3)?.applicationId === "B1", "Platz 3");
  assert(placements.find((row) => row.place === 4)?.applicationId === "C1", "Platz 4");
  assert(placements.find((row) => row.place === 5)?.applicationId === "B2", "Platz 5");
  assert(placements.find((row) => row.place === 6)?.applicationId === "A2", "Platz 6");
  assert(placements.find((row) => row.place === 7)?.applicationId === "D2", "Platz 7");
  assert(placements.find((row) => row.place === 8)?.applicationId === "D1", "Platz 8");

  assert(
    hasDuplicateTeamInRound([
      { round: "semifinal", homeApplicationId: "A1", awayApplicationId: "A1" },
    ]),
    "Team gegen sich selbst in einer Runde",
  );
  assert(
    hasDuplicateTeamInRound([
      { round: "semifinal", homeApplicationId: "A1", awayApplicationId: "B2" },
      { round: "semifinal", homeApplicationId: "A1", awayApplicationId: "A2" },
    ]),
    "Team darf nicht zweimal in derselben KO-Runde stehen",
  );
  assert(
    !hasSelfPlay([{ homeId: "A1", awayId: "B2" }]),
    "Gültige Paarung ist kein Selbstspiel",
  );

  const incomplete = isGroupStageComplete(
    [{ id: "g1" }, { id: "g2" }],
    { g1: ["A1", "A2"], g2: ["B1", "B2"] },
    [{ groupId: "g1", status: "completed", phase: "group" }],
  );
  assert(!incomplete.complete, "Unvollständige Gruppenphase wird erkannt");

  const qualified = qualifyTopTwo(
    [{ id: "g1" }, { id: "g2" }],
    {
      g1: [rankRow("A1", 1), rankRow("A2", 2)],
      g2: [rankRow("B1", 1), rankRow("B2", 2)],
    },
  );
  assert(qualified.map((team) => team.seedLabel).join(",") === "A1,A2,B1,B2", "Qualifikation Top 2");

  return "ok";
}

function koMatch(partial: Partial<KnockoutMatchLike> & { id?: string }): KnockoutMatchLike & { id: string } {
  return {
    id: partial.id ?? "match",
    homeApplicationId: null,
    awayApplicationId: null,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    decidedBy: "regular",
    homePenalties: null,
    awayPenalties: null,
    round: null,
    nextMatchId: null,
    nextMatchSlot: null,
    loserNextMatchId: null,
    loserNextMatchSlot: null,
    ...partial,
  };
}

function planToMatches(
  plan: Array<{
    key: string;
    round: NonNullable<KnockoutMatchLike["round"]>;
    homeId: string | null;
    awayId: string | null;
    nextKey: string | null;
    nextSlot: KnockoutMatchLike["nextMatchSlot"];
    loserNextKey: string | null;
    loserNextSlot: KnockoutMatchLike["loserNextMatchSlot"];
  }>,
) {
  return plan.map((match) =>
    koMatch({
      id: match.key,
      round: match.round,
      homeApplicationId: match.homeId,
      awayApplicationId: match.awayId,
      nextMatchId: match.nextKey,
      nextMatchSlot: match.nextSlot,
      loserNextMatchId: match.loserNextKey,
      loserNextMatchSlot: match.loserNextSlot,
    }),
  );
}

function completeAndPropagate(
  matches: Array<KnockoutMatchLike & { id: string }>,
  id: string,
  homeScore: number,
  awayScore: number,
  penalties?: { homePenalties: number; awayPenalties: number },
) {
  const next = matches.map((match) =>
    match.id === id
      ? {
          ...match,
          homeScore,
          awayScore,
          status: "completed" as const,
          decidedBy: penalties ? ("penalties" as const) : ("regular" as const),
          homePenalties: penalties?.homePenalties ?? null,
          awayPenalties: penalties?.awayPenalties ?? null,
        }
      : { ...match },
  );
  return propagateKnockoutTeams(next);
}
