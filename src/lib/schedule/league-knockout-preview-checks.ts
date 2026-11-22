import { buildLeagueFixtures } from "@/lib/schedule/league-phase";
import { buildLeagueQualificationPreview } from "@/lib/schedule/league-knockout-preview";
import { computeGroupStandings } from "@/lib/schedule/standings";
import type { MatchStatus } from "@/types/schedule";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const teams = ["team-a", "team-b", "team-c", "team-d"];

function completedMatch(homeId: string, awayId: string, homeScore: number, awayScore: number) {
  return {
    groupId: "group-1",
    phase: "group",
    status: "completed" as MatchStatus,
    homeApplicationId: homeId,
    awayApplicationId: awayId,
    homeExternalTeamId: null,
    awayExternalTeamId: null,
    homeScore,
    awayScore,
  };
}

export function runLeagueKnockoutPreviewChecks() {
  const fixtures = buildLeagueFixtures({
    teamIds: teams,
    matchesPerTeam: 1,
    knockoutCutoff: 4,
  });
  assert(fixtures.error == null && fixtures.fixtures.length === 2, "four teams play one opponent each");

  const open = buildLeagueQualificationPreview({
    groupId: "group-1",
    memberIds: teams,
    matches: [],
    matchesPerTeam: 1,
    knockoutCutoff: 4,
    options: {
      format: 4,
      includeThirdPlace: true,
      includePlacement5: false,
      includePlacement7: false,
    },
  });
  assert(open.provisional, "an empty league stays provisional");
  assert(!open.progress.complete, "an empty league is not complete");
  assert(open.qualifiers.length === 4, "provisional ranks are visible");

  const played = fixtures.fixtures.map((fixture, index) =>
    completedMatch(fixture.homeId, fixture.awayId, index === 0 ? 2 : 1, 0),
  );
  const finalPreview = buildLeagueQualificationPreview({
    groupId: "group-1",
    memberIds: teams,
    matches: played,
    matchesPerTeam: 1,
    knockoutCutoff: 4,
    options: {
      format: 4,
      includeThirdPlace: true,
      includePlacement5: false,
      includePlacement7: false,
    },
  });
  assert(!finalPreview.provisional && finalPreview.progress.complete, "a complete league is final");
  assert(finalPreview.plan.error == null, "complete league builds a knockout plan");
  const pairs = finalPreview.firstRoundMatches.map((match) => [match.homeId, match.awayId]);
  const standings = computeGroupStandings(teams, played);
  const byRank = Object.fromEntries(standings.map((row) => [row.rank, row.applicationId]));
  assert(
    pairs.some((pair) => pair[0] === byRank[1] && pair[1] === byRank[4]) &&
      pairs.some((pair) => pair[0] === byRank[2] && pair[1] === byRank[3]),
    "top 4 pairs 1-4 and 2-3",
  );

  const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const eightPreview = buildLeagueQualificationPreview({
    groupId: "group-1",
    memberIds: eight,
    matches: [],
    matchesPerTeam: 1,
    knockoutCutoff: 8,
    options: {
      format: 8,
      includeThirdPlace: false,
      includePlacement5: false,
      includePlacement7: false,
    },
  });
  const eightPairs = [...eightPreview.firstRoundMatches]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((match) => [match.homeId, match.awayId]);
  assert(
    eightPairs.length === 4 &&
      eightPairs[0]?.[0] === "a" &&
      eightPairs[0]?.[1] === "h" &&
      eightPairs[1]?.[0] === "d" &&
      eightPairs[1]?.[1] === "e" &&
      eightPairs[2]?.[0] === "b" &&
      eightPairs[2]?.[1] === "g" &&
      eightPairs[3]?.[0] === "c" &&
      eightPairs[3]?.[1] === "f",
    "top 8 uses the league pairing order",
  );

  const tied = computeGroupStandings(
    ["b-team", "a-team"],
    [
      completedMatch("b-team", "a-team", 1, 1),
    ].map((match) => ({ ...match, groupId: "group-1" })),
  );
  assert(tied[0]?.applicationId === "a-team" && tied[0]?.points === tied[1]?.points, "equal points keep a stable id order");

  const sixteen = Array.from({ length: 16 }, (_, index) => `t${String(index + 1).padStart(2, "0")}`);
  const sixteenFixtures = buildLeagueFixtures({
    teamIds: sixteen,
    matchesPerTeam: 4,
    knockoutCutoff: 8,
  });
  assert(sixteenFixtures.error == null && sixteenFixtures.fixtures.length === 32, "sixteen teams and four rounds make 32 matches");
  const opponentCount = new Map<string, number>();
  const seenPairs = new Set<string>();
  for (const fixture of sixteenFixtures.fixtures) {
    const pair = [fixture.homeId, fixture.awayId].sort().join(":");
    assert(!seenPairs.has(pair), "sixteen-team fixtures do not repeat an opponent");
    seenPairs.add(pair);
    opponentCount.set(fixture.homeId, (opponentCount.get(fixture.homeId) ?? 0) + 1);
    opponentCount.set(fixture.awayId, (opponentCount.get(fixture.awayId) ?? 0) + 1);
  }
  assert(
    sixteen.every((teamId) => opponentCount.get(teamId) === 4),
    "each of the sixteen teams has four distinct opponents",
  );
  const sixteenOptions = {
    format: 8 as const,
    includeThirdPlace: false,
    includePlacement5: false,
    includePlacement7: false,
  };
  const incompleteSixteen = buildLeagueQualificationPreview({
    groupId: "group-1",
    memberIds: sixteen,
    matches: sixteenFixtures.fixtures.slice(0, -1).map((fixture) =>
      completedMatch(fixture.homeId, fixture.awayId, 1, 0),
    ),
    matchesPerTeam: 4,
    knockoutCutoff: 8,
    options: sixteenOptions,
  });
  assert(incompleteSixteen.provisional, "a sixteen-team league with one match missing stays provisional");
  const completeSixteenMatches = sixteenFixtures.fixtures.map((fixture) =>
    completedMatch(fixture.homeId, fixture.awayId, 1, 0),
  );
  const completeSixteen = buildLeagueQualificationPreview({
    groupId: "group-1",
    memberIds: sixteen,
    matches: completeSixteenMatches,
    matchesPerTeam: 4,
    knockoutCutoff: 8,
    options: sixteenOptions,
  });
  assert(!completeSixteen.provisional && completeSixteen.progress.complete, "a complete sixteen-team league is final");
  const sixteenRanks = Object.fromEntries(
    computeGroupStandings(sixteen, completeSixteenMatches).map((row) => [row.rank, row.applicationId]),
  );
  const sixteenPairs = completeSixteen.firstRoundMatches.map((match) => [match.homeId, match.awayId]);
  assert(
    sixteenPairs.some((pair) => pair[0] === sixteenRanks[1] && pair[1] === sixteenRanks[8]) &&
      sixteenPairs.some((pair) => pair[0] === sixteenRanks[4] && pair[1] === sixteenRanks[5]) &&
      sixteenPairs.some((pair) => pair[0] === sixteenRanks[2] && pair[1] === sixteenRanks[7]) &&
      sixteenPairs.some((pair) => pair[0] === sixteenRanks[3] && pair[1] === sixteenRanks[6]),
    "complete sixteen-team top 8 pairs 1-8, 4-5, 2-7 and 3-6",
  );

  return "ok";
}
