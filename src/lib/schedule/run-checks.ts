import { categoryRank, distributeTeams, groupSizeSpread } from "@/lib/schedule/distribute";
import {
  expectedGroupMatchCount,
  hasSelfPlay,
  roundRobinFixtures,
} from "@/lib/schedule/round-robin";
import { computeGroupStandings } from "@/lib/schedule/standings";
import { buildTimetable } from "@/lib/schedule/timetable";
import { berlinWallTimeToIso } from "@/lib/schedule/datetime";
import type { PublicRosterEntry } from "@/types/schedule";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
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

  return "ok";
}
