import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  championsLeagueFinalQualifierIds,
  championsLeagueQualificationBand,
  championsLeagueQualificationLabel,
  isChampionsLeagueKnockoutQualificationConsistent,
  isChampionsLeaguePhaseComplete,
  standingRowIsConsistent,
} from "../../src/lib/tournaments/champions-league-public.ts";
import { computeGroupStandings } from "../../src/lib/schedule/standings.ts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function result(homeApplicationId, awayApplicationId, homeScore, awayScore) {
  return {
    homeApplicationId,
    awayApplicationId,
    homeExternalTeamId: null,
    awayExternalTeamId: null,
    homeScore,
    awayScore,
    status: "completed",
  };
}

function oneRoundResults(teamCount) {
  return Array.from({ length: teamCount / 2 }, (_, index) =>
    result(
      `team-${index + 1}`,
      `team-${teamCount - index}`,
      4 - (index % 3),
      index % 2,
    ),
  );
}

function knockoutMatch(round, homeApplicationId, awayApplicationId) {
  return {
    phase: "knockout",
    round,
    homeApplicationId,
    awayApplicationId,
    homeExternalTeamId: null,
    awayExternalTeamId: null,
  };
}

test("marks exactly the configured top four, top eight or top sixteen qualification places", () => {
  assert.equal(championsLeagueQualificationBand(4, 4), "knockout");
  assert.equal(championsLeagueQualificationBand(5, 4), "outside");
  assert.equal(championsLeagueQualificationBand(8, 8), "knockout");
  assert.equal(championsLeagueQualificationBand(9, 8), "outside");
  assert.equal(championsLeagueQualificationBand(16, 16), "knockout");
  assert.equal(championsLeagueQualificationBand(17, 16), "outside");
});

test("keeps qualification provisional until every configured league match is complete", () => {
  const finished = { status: "completed", homeScore: 2, awayScore: 1 };
  assert.equal(
    isChampionsLeaguePhaseComplete({
      standings: [{ played: 3 }, { played: 3 }, { played: 3 }, { played: 3 }],
      matches: [finished, finished, finished, finished, finished, finished],
      matchesPerTeam: 3,
    }),
    true,
  );
  assert.equal(
    isChampionsLeaguePhaseComplete({
      standings: [{ played: 2 }, { played: 2 }],
      matches: [{ status: "scheduled", homeScore: null, awayScore: null }],
      matchesPerTeam: 3,
    }),
    false,
  );
  assert.match(
    championsLeagueQualificationLabel({ complete: false, knockoutCutoff: 8 }),
    /aktueller K\.-o\.-Qualifikationsplatz/,
  );
});

test("derives internally consistent final tables from real results for 16 and 18 teams", () => {
  for (const teamCount of [16, 18]) {
    const teamIds = Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`);
    const matches = oneRoundResults(teamCount);
    const standings = computeGroupStandings(teamIds, matches);

    assert.equal(standings.length, teamCount);
    assert.equal(standings.every(standingRowIsConsistent), true);
    assert.equal(
      isChampionsLeaguePhaseComplete({ standings, matches, matchesPerTeam: 1 }),
      true,
    );
    assert.equal(
      standings.every((row) => row.played === row.won + row.drawn + row.lost),
      true,
    );
  }
});

test("resolves equal points by the existing deterministic table tie breakers", () => {
  const standings = computeGroupStandings(
    ["team-b", "team-a", "team-c", "team-d"],
    [result("team-a", "team-b", 1, 1), result("team-c", "team-d", 0, 0)],
  );
  assert.deepEqual(
    standings.map((row) => row.applicationId),
    ["team-a", "team-b", "team-c", "team-d"],
  );
  assert.equal(standings.every(standingRowIsConsistent), true);
});

test("reveals persisted knockout teams only when they exactly match the final table", () => {
  const teamIds = Array.from({ length: 16 }, (_, index) => `team-${index + 1}`);
  const leagueMatches = oneRoundResults(16);
  const standings = computeGroupStandings(teamIds, leagueMatches);
  const complete = isChampionsLeaguePhaseComplete({
    standings,
    matches: leagueMatches,
    matchesPerTeam: 1,
  });
  const qualifiers = championsLeagueFinalQualifierIds({
    complete,
    standings,
    knockoutCutoff: 4,
  });
  const consistent = [
    knockoutMatch("semifinal", qualifiers[0], qualifiers[3]),
    knockoutMatch("semifinal", qualifiers[1], qualifiers[2]),
    knockoutMatch("final", null, null),
    knockoutMatch("third-place", null, null),
  ];

  assert.equal(
    isChampionsLeagueKnockoutQualificationConsistent({
      complete,
      standings,
      knockoutCutoff: 4,
      matches: consistent,
    }),
    true,
  );

  const staleAfterRegeneration = consistent.map((match, index) =>
    index === 0 ? { ...match, awayApplicationId: "team-not-qualified" } : match,
  );
  assert.equal(
    isChampionsLeagueKnockoutQualificationConsistent({
      complete,
      standings,
      knockoutCutoff: 4,
      matches: staleAfterRegeneration,
    }),
    false,
  );
  assert.equal(
    isChampionsLeagueKnockoutQualificationConsistent({
      complete: false,
      standings,
      knockoutCutoff: 4,
      matches: consistent,
    }),
    false,
  );
});

test("covers league to top-eight knockout tree and final without inventing participants", () => {
  const teamIds = Array.from({ length: 18 }, (_, index) => `team-${index + 1}`);
  const leagueMatches = oneRoundResults(18);
  const standings = computeGroupStandings(teamIds, leagueMatches);
  const complete = isChampionsLeaguePhaseComplete({ standings, matches: leagueMatches, matchesPerTeam: 1 });
  const qualifiers = championsLeagueFinalQualifierIds({ complete, standings, knockoutCutoff: 8 });
  const firstRound = [
    [0, 7],
    [3, 4],
    [1, 6],
    [2, 5],
  ].map(([home, away]) => knockoutMatch("quarterfinal", qualifiers[home], qualifiers[away]));
  const tree = [
    ...firstRound,
    knockoutMatch("semifinal", null, null),
    knockoutMatch("semifinal", null, null),
    knockoutMatch("third-place", null, null),
    knockoutMatch("final", null, null),
  ];

  assert.equal(qualifiers.length, 8);
  assert.equal(
    isChampionsLeagueKnockoutQualificationConsistent({
      complete,
      standings,
      knockoutCutoff: 8,
      matches: tree,
    }),
    true,
  );
  assert.equal(tree.filter((match) => match.round === "final").length, 1);
  assert.equal(tree.filter((match) => match.round === "third-place").length, 1);
  assert.equal(tree.filter((match) => match.round === "semifinal").every((match) => match.homeApplicationId == null && match.awayApplicationId == null), true);
});

test("top 16 and same-club avoidance are implemented in the league phase", () => {
  const league = read("src/lib/schedule/league-phase.ts");
  const scheduleTypes = read("src/types/schedule.ts");

  assert.match(league, /LEAGUE_KNOCKOUT_CUTOFFS = \[4, 8, 16\]/);
  assert.match(scheduleTypes, /round-of-16/);
  assert.match(league, /restrictSameClub/);
});

test("public route detects stored CL mode with the safe missing-column fallback", () => {
  const page = read("src/app/turniere/[slug]/page.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");

  assert.match(page, /readStoredLeagueScheduleConfig\(tournament\.id\)/);
  assert.match(page, /leagueConfig\.status === "ok"/);
  assert.match(page, /competitionFormat: null/);
  assert.match(stage, /competitionFormat === "champions-league"/);
  assert.match(stage, /ChampionsLeagueStandings/);
  assert.match(stage, /ChampionsLeagueSchedule/);
  assert.match(stage, /ChampionsLeagueLiveView/);
  assert.match(stage, /isChampionsLeagueKnockoutQualificationConsistent/);
});

test("CL public components stay read-only and classic presenters remain wired", () => {
  const schedule = read("src/components/tournaments/ChampionsLeagueSchedule.tsx");
  const standings = read("src/components/tournaments/ChampionsLeagueStandings.tsx");
  const stage = read("src/components/tournaments/TournamentPublicStage.tsx");
  const combined = `${schedule}\n${standings}`;

  assert.doesNotMatch(combined, /createClient|use server|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(schedule, /Alle Mannschaften/);
  assert.match(schedule, /Alle Spielfelder/);
  assert.match(schedule, /Alle Status/);
  assert.match(schedule, /Alle Zeitblöcke/);
  assert.match(standings, /goalsAgainst/);
  assert.doesNotMatch(standings, /overflow-x-auto/);
  assert.match(stage, /TournamentGroupCards/);
  assert.match(stage, /TournamentStandingsSection/);
  assert.match(stage, /TournamentScheduleCards/);
});
