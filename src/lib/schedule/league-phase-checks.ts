import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildKnockoutPlan,
  defaultFirstRoundSeeds,
  propagateKnockoutTeams,
  qualifyTopTwo,
  type KnockoutMatchLike,
  type KnockoutOptions,
  type QualifiedTeam,
} from "@/lib/schedule/knockout";
import {
  buildLeagueFixtures,
  buildLeagueKnockoutPlan,
  expectedLeagueMatchCount,
  leagueFirstRoundRanks,
  selectLeagueQualifiers,
  validateLeaguePhaseConfig,
  type LeagueFixture,
  type LeaguePhaseInput,
  type RankedLeagueTeam,
} from "@/lib/schedule/league-phase";
import { expectedGroupMatchCount, roundRobinFixtures } from "@/lib/schedule/round-robin";
import { defaultTieBreakers } from "@/lib/schedule/standings";
import type { StandingRow } from "@/types/schedule";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`league-phase-checks: ${message}`);
  }
}

function teams(count: number, prefix = "t") {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function pairKey(homeId: string, awayId: string) {
  return homeId < awayId ? `${homeId}|${awayId}` : `${awayId}|${homeId}`;
}

function degree(teamIds: readonly string[], fixtures: readonly LeagueFixture[]) {
  const played = new Map(teamIds.map((teamId) => [teamId, 0]));
  for (const fixture of fixtures) {
    played.set(fixture.homeId, (played.get(fixture.homeId) ?? 0) + 1);
    played.set(fixture.awayId, (played.get(fixture.awayId) ?? 0) + 1);
  }
  return played;
}

function assertValidSchedule(
  teamIds: readonly string[],
  matchesPerTeam: number,
  cutoff: 4 | 8,
) {
  const built = buildLeagueFixtures({ teamIds, matchesPerTeam, knockoutCutoff: cutoff });
  assert(built.error == null && built.code == null, `${teamIds.length}/${matchesPerTeam}: ${built.error}`);
  const expected = expectedLeagueMatchCount(teamIds.length, matchesPerTeam);
  assert(built.fixtures.length === expected, `${teamIds.length}/${matchesPerTeam}: match count`);
  assert(
    built.fixtures.every((fixture) => fixture.homeId !== fixture.awayId),
    `${teamIds.length}/${matchesPerTeam}: self-play`,
  );

  const pairs = built.fixtures.map((fixture) => pairKey(fixture.homeId, fixture.awayId));
  assert(new Set(pairs).size === pairs.length, `${teamIds.length}/${matchesPerTeam}: duplicate opponent`);

  const played = degree(teamIds, built.fixtures);
  for (const teamId of teamIds) {
    assert(played.get(teamId) === matchesPerTeam, `${teamIds.length}/${matchesPerTeam}: degree ${teamId}`);
  }

  const again = buildLeagueFixtures({ teamIds, matchesPerTeam, knockoutCutoff: cutoff });
  assert(
    JSON.stringify(again.fixtures) === JSON.stringify(built.fixtures),
    `${teamIds.length}/${matchesPerTeam}: deterministic`,
  );
  return built.fixtures;
}

function ranked(ids: readonly string[]): RankedLeagueTeam[] {
  return ids.map((participantId, index) => ({ participantId, rank: index + 1 }));
}

function shuffledRanks(ids: readonly string[]): RankedLeagueTeam[] {
  return [...ranked(ids)].reverse();
}

function issue(input: LeaguePhaseInput) {
  const result = validateLeaguePhaseConfig(input);
  return result.ok ? null : result.code;
}

function groupQualifiers(format: 4 | 8): QualifiedTeam[] {
  const labels = defaultFirstRoundSeeds(format).flat();
  return [...new Set(labels)].map((seedLabel, index) => ({
    applicationId: seedLabel,
    groupIndex: index,
    rank: 1,
    seedLabel,
  }));
}

function linkShape(matches: ReadonlyArray<{ key: string; round: string; homeId: string | null; awayId: string | null; nextKey: string | null; nextSlot: string | null; loserNextKey: string | null; loserNextSlot: string | null; sortOrder: number }>) {
  return matches.map((match) => ({
    key: match.key,
    round: match.round,
    seeded: match.homeId != null && match.awayId != null,
    nextKey: match.nextKey,
    nextSlot: match.nextSlot,
    loserNextKey: match.loserNextKey,
    loserNextSlot: match.loserNextSlot,
    sortOrder: match.sortOrder,
  }));
}

function knockoutRecord(
  match: {
    key: string;
    round: KnockoutMatchLike["round"];
    homeId: string | null;
    awayId: string | null;
    nextKey: string | null;
    nextSlot: KnockoutMatchLike["nextMatchSlot"];
    loserNextKey: string | null;
    loserNextSlot: KnockoutMatchLike["loserNextMatchSlot"];
  },
  ids: Map<string, string>,
): KnockoutMatchLike & { id: string } {
  return {
    id: ids.get(match.key) ?? match.key,
    homeApplicationId: match.homeId,
    awayApplicationId: match.awayId,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    decidedBy: "regular",
    homePenalties: null,
    awayPenalties: null,
    round: match.round,
    nextMatchId: match.nextKey ? (ids.get(match.nextKey) ?? null) : null,
    nextMatchSlot: match.nextSlot,
    loserNextMatchId: match.loserNextKey ? (ids.get(match.loserNextKey) ?? null) : null,
    loserNextMatchSlot: match.loserNextSlot,
  };
}

export function runLeaguePhaseChecks() {
  const leaguePhase = read("src/lib/schedule/league-phase.ts");
  const roundRobin = read("src/lib/schedule/round-robin.ts");
  const knockout = read("src/lib/schedule/knockout.ts");
  const standings = read("src/lib/schedule/standings.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");

  assert(
    !leaguePhase.includes("roundRobinFixtures") &&
      !leaguePhase.includes("qualifyTopTwo") &&
      !leaguePhase.includes("defaultTieBreakers") &&
      !leaguePhase.includes("use server") &&
      !leaguePhase.includes("supabase") &&
      !leaguePhase.includes("createClient"),
    "league phase stays pure and does not wrap the existing format helpers",
  );
  assert(
    roundRobin.includes("export function roundRobinFixtures") &&
      roundRobin.includes('const BYE = "__bye__"') &&
      knockout.includes("export function qualifyTopTwo") &&
      knockout.includes("standings.slice(0, 2)") &&
      knockout.includes('["A1", "B2"]') &&
      knockout.includes('["D1", "C2"]') &&
      knockout.includes("export function defaultFirstRoundSeeds") &&
      standings.includes("export const defaultTieBreakers") &&
      standings.includes("b.points - a.points") &&
      standings.includes("b.goalDiff - a.goalDiff") &&
      standings.includes("b.goalsFor - a.goalsFor") &&
      standings.includes("a.applicationId.localeCompare(b.applicationId)"),
    "existing round robin, qualification, seeds, and tie-breaks stay in place",
  );
  assert(
    !read("src/lib/db/schedule-actions.ts").includes("league-phase") &&
      !read("src/lib/db/knockout-actions.ts").includes("league-phase") &&
      !read("src/lib/schedule/plan-preview.ts").includes("league-phase") &&
      !read("src/components/admin/TournamentScheduleBoard.tsx").includes("league-phase") &&
      !read("src/components/admin/TournamentKnockoutBoard.tsx").includes("league-phase"),
    "stage 1 does not reach actions or UI",
  );
  assert(
    runChecksCli.includes("runLeaguePhaseChecks") &&
      runChecksCli.includes("league-phase-checks"),
    "league-phase-checks wired into run-checks-cli",
  );

  const four = roundRobinFixtures(["a", "b", "c", "d"]);
  assert(four.length === expectedGroupMatchCount(4) && four.length === 6, "existing 4-team round robin");
  assert(defaultFirstRoundSeeds(4).length === 2 && defaultFirstRoundSeeds(8).length === 4, "existing seed counts");
  assert(
    JSON.stringify(defaultFirstRoundSeeds(8)) ===
      JSON.stringify([
        ["A1", "B2"],
        ["B1", "A2"],
        ["C1", "D2"],
        ["D1", "C2"],
      ]),
    "existing 8-team seeds",
  );
  const qualified = qualifyTopTwo(
    [{ id: "gA" }, { id: "gB" }],
    {
      gA: [row("A1", 1), row("A2", 2), row("A3", 3)],
      gB: [row("B1", 1), row("B2", 2)],
    },
  );
  assert(
    qualified.map((team) => team.seedLabel).join(",") === "A1,A2,B1,B2",
    "existing top-two qualification",
  );
  const tieLeft = row("b", 0);
  const tieRight = row("a", 0);
  tieLeft.points = 1;
  assert(defaultTieBreakers[0]?.(tieLeft, tieRight, { matches: [] }) < 0, "existing points tie-break");

  assert(issue({ teamIds: teams(8), matchesPerTeam: 3, knockoutCutoff: 6 }) === "INVALID_CUTOFF", "cutoff 6 rejected");
  assert(issue({ teamIds: teams(8), matchesPerTeam: 1.5, knockoutCutoff: 8 }) === "INVALID_MATCHES_PER_TEAM", "fractional matches rejected");
  assert(issue({ teamIds: ["a", " "], matchesPerTeam: 1, knockoutCutoff: 4 }) === "EMPTY_TEAM_ID", "blank id rejected");
  assert(issue({ teamIds: ["a", "a", "b", "c"], matchesPerTeam: 1, knockoutCutoff: 4 }) === "DUPLICATE_TEAM", "duplicate team rejected");
  assert(issue({ teamIds: ["only"], matchesPerTeam: 1, knockoutCutoff: 4 }) === "TOO_FEW_TEAMS", "one team rejected");
  assert(issue({ teamIds: teams(8), matchesPerTeam: 0, knockoutCutoff: 8 }) === "MATCHES_OUT_OF_RANGE", "zero matches rejected");
  assert(issue({ teamIds: teams(8), matchesPerTeam: 8, knockoutCutoff: 8 }) === "MATCHES_OUT_OF_RANGE", "too many matches rejected");
  assert(issue({ teamIds: teams(9), matchesPerTeam: 3, knockoutCutoff: 8 }) === "UNEVEN_MATCH_TOTAL", "odd times odd rejected");
  assert(issue({ teamIds: teams(5), matchesPerTeam: 2, knockoutCutoff: 8 }) === "CUTOFF_EXCEEDS_TEAMS", "5 teams cannot fill 8 places");
  assert(issue({ teamIds: teams(6), matchesPerTeam: 1, knockoutCutoff: 8 }) === "CUTOFF_EXCEEDS_TEAMS", "6 teams cannot fill 8 places");
  assert(expectedLeagueMatchCount(9, 3) == null, "infeasible count is null");
  assert(expectedLeagueMatchCount(8, 3) === 12, "8 teams x 3 is 12 matches");

  const exactEight = validateLeaguePhaseConfig({ teamIds: teams(8), matchesPerTeam: 3, knockoutCutoff: 8 });
  assert(exactEight.ok && exactEight.config.teamIds.length === 8, "8 teams may all qualify");
  const exactFour = validateLeaguePhaseConfig({ teamIds: teams(4), matchesPerTeam: 1, knockoutCutoff: 4 });
  assert(exactFour.ok, "4 teams may all reach the semifinals");

  for (const teamCount of [4, 6, 8, 10, 12]) {
    for (let matchesPerTeam = 1; matchesPerTeam < teamCount; matchesPerTeam += 1) {
      assertValidSchedule(teams(teamCount), matchesPerTeam, teamCount >= 8 ? 8 : 4);
    }
  }

  for (const teamCount of [5, 7, 9, 11, 13]) {
    for (let matchesPerTeam = 2; matchesPerTeam < teamCount; matchesPerTeam += 2) {
      assertValidSchedule(teams(teamCount), matchesPerTeam, teamCount >= 8 ? 8 : 4);
    }
  }

  const fullEven = assertValidSchedule(["a", "b", "c", "d", "e", "f"], 5, 4);
  const classic = roundRobinFixtures(["a", "b", "c", "d", "e", "f"]);
  assert(
    JSON.stringify(fullEven.map(({ homeId, awayId }) => ({ homeId, awayId }))) === JSON.stringify(classic),
    "full even league matches the circle-method order",
  );

  const fullOdd = assertValidSchedule(teams(7), 6, 4);
  const oddPairs = new Set(fullOdd.map((fixture) => pairKey(fixture.homeId, fixture.awayId)));
  const classicOddPairs = new Set(
    roundRobinFixtures(teams(7)).map((fixture) => pairKey(fixture.homeId, fixture.awayId)),
  );
  assert(oddPairs.size === expectedGroupMatchCount(7), "full odd league covers every opponent once");
  assert(
    [...oddPairs].every((pair) => classicOddPairs.has(pair)),
    "full odd league has the same opponents as a full round robin",
  );

  const partial = assertValidSchedule(teams(8), 3, 8);
  const rounds = new Map<number, LeagueFixture[]>();
  for (const fixture of partial) {
    const round = rounds.get(fixture.roundIndex) ?? [];
    round.push(fixture);
    rounds.set(fixture.roundIndex, round);
  }
  assert(rounds.size === 3, "three circle rounds");
  for (const round of rounds.values()) {
    const seen = new Set(round.flatMap((fixture) => [fixture.homeId, fixture.awayId]));
    assert(round.length === 4 && seen.size === 8, "each even round is a perfect matching");
  }

  const oddPartial = assertValidSchedule(teams(9), 2, 8);
  assert(new Set(oddPartial.map((fixture) => fixture.roundIndex)).size === 1, "one Hamilton cycle");
  assert(oddPartial.length === 9, "cycle has one edge per team");

  assert(
    JSON.stringify(leagueFirstRoundRanks(8)) === JSON.stringify([[1, 8], [4, 5], [2, 7], [3, 6]]),
    "quarterfinal ranks",
  );
  assert(
    JSON.stringify(leagueFirstRoundRanks(4)) === JSON.stringify([[1, 4], [2, 3]]),
    "semifinal ranks",
  );

  const eightIds = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10"];
  const quarterOptions: KnockoutOptions = {
    format: 8,
    includeThirdPlace: true,
    includePlacement5: true,
    includePlacement7: true,
  };
  const quarters = buildLeagueKnockoutPlan(quarterOptions, shuffledRanks(eightIds));
  assert(quarters.error == null, "top 8 plan");
  const quarterSides = Object.fromEntries(
    quarters.matches.filter((match) => match.homeId && match.awayId).map((match) => [match.key, [match.homeId, match.awayId]]),
  );
  assert(JSON.stringify(quarterSides.qf1) === JSON.stringify(["n1", "n8"]), "1 vs 8");
  assert(JSON.stringify(quarterSides.qf2) === JSON.stringify(["n4", "n5"]), "4 vs 5");
  assert(JSON.stringify(quarterSides.qf3) === JSON.stringify(["n2", "n7"]), "2 vs 7");
  assert(JSON.stringify(quarterSides.qf4) === JSON.stringify(["n3", "n6"]), "3 vs 6");
  assert(
    quarters.matches.every((match) => match.homeId == null || !match.homeId.startsWith("seed:")),
    "placeholder seeds are not persisted",
  );
  assert(
    JSON.stringify(linkShape(quarters.matches)) ===
      JSON.stringify(linkShape(buildKnockoutPlan(quarterOptions, groupQualifiers(8)).matches)),
    "top 8 reuses the existing knockout graph",
  );
  assert(quarters.matches.some((match) => match.key === "third"), "third place preserved");
  assert(quarters.matches.some((match) => match.key === "p5"), "places 5/6 preserved");
  assert(quarters.matches.some((match) => match.key === "p7"), "places 7/8 preserved");
  assert(
    quarters.matches.find((match) => match.key === "sf1")?.homeId == null &&
      quarters.matches.find((match) => match.key === "final")?.awayId == null,
    "later rounds stay open",
  );

  const semiOptions: KnockoutOptions = {
    format: 4,
    includeThirdPlace: false,
    includePlacement5: true,
    includePlacement7: true,
  };
  const semis = buildLeagueKnockoutPlan(semiOptions, shuffledRanks(["a", "b", "c", "d", "e"]));
  assert(semis.error == null, "top 4 plan");
  const semiSides = Object.fromEntries(
    semis.matches.filter((match) => match.homeId && match.awayId).map((match) => [match.key, [match.homeId, match.awayId]]),
  );
  assert(JSON.stringify(semiSides.sf1) === JSON.stringify(["a", "d"]), "1 vs 4");
  assert(JSON.stringify(semiSides.sf2) === JSON.stringify(["b", "c"]), "2 vs 3");
  assert(!semis.matches.some((match) => match.round === "quarterfinal"), "top 4 starts at the semifinal");
  assert(!semis.matches.some((match) => match.key === "third" || match.key === "p5" || match.key === "p7"), "optional placement matches stay off");
  assert(
    JSON.stringify(linkShape(semis.matches)) ===
      JSON.stringify(linkShape(buildKnockoutPlan(semiOptions, groupQualifiers(4)).matches)),
    "top 4 reuses the existing semifinal graph",
  );

  const missing = selectLeagueQualifiers(ranked(["a", "b", "c", "d", "e", "f", "g"]), 8);
  assert(missing.error != null && missing.qualifiers.length === 0, "missing eighth place");
  const duplicateRank = selectLeagueQualifiers(
    [
      { participantId: "a", rank: 1 },
      { participantId: "b", rank: 1 },
      { participantId: "c", rank: 3 },
      { participantId: "d", rank: 4 },
    ],
    4,
  );
  assert(duplicateRank.error != null, "shared rank rejected");
  const duplicateTeam = selectLeagueQualifiers(
    [
      { participantId: "a", rank: 1 },
      { participantId: "a", rank: 2 },
      { participantId: "c", rank: 3 },
      { participantId: "d", rank: 4 },
    ],
    4,
  );
  assert(duplicateTeam.error != null, "duplicate qualifier rejected");

  const ids = new Map(quarters.matches.map((match) => [match.key, `id-${match.key}`]));
  const records = quarters.matches.map((match) => knockoutRecord(match, ids));
  const qf1 = records.find((match) => match.id === "id-qf1");
  assert(qf1 != null, "quarterfinal record");
  const advanced = propagateKnockoutTeams(
    records.map((match) =>
      match.id === qf1.id
        ? { ...match, status: "completed" as const, homeScore: 2, awayScore: 1 }
        : match,
    ),
  );
  const semifinal = advanced.find((match) => match.id === "id-sf1");
  assert(semifinal?.homeApplicationId === "n1", "quarterfinal winner takes the existing home slot");

  return "ok";
}

function row(applicationId: string, rank: number): StandingRow {
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
