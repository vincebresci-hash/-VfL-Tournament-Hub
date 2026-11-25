import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEAGUE_KNOCKOUT_CUTOFFS,
  buildLeagueFixtures,
  buildLeagueKnockoutPlan,
  expectedLeagueMatchCount,
} from "../../src/lib/schedule/league-phase.ts";

const LEAGUE_COUNT_OPTIONS = {
  includeThirdPlace: true,
  includePlacement5: false,
  includePlacement7: false,
};

function teamIds(count) {
  return Array.from({ length: count }, (_, index) => `team-${index + 1}`);
}

function assertValidLeague(fixtures, teams, matchesPerTeam) {
  const played = new Map(teams.map((id) => [id, 0]));
  const pairs = new Set();
  for (const fixture of fixtures) {
    assert.notEqual(fixture.homeId, fixture.awayId, "no team plays itself");
    const key = [fixture.homeId, fixture.awayId].sort().join("\u0000");
    assert.ok(!pairs.has(key), `no repeated opponents: ${key}`);
    pairs.add(key);
    played.set(fixture.homeId, (played.get(fixture.homeId) ?? 0) + 1);
    played.set(fixture.awayId, (played.get(fixture.awayId) ?? 0) + 1);
  }
  for (const id of teams) {
    assert.equal(played.get(id), matchesPerTeam, `exact match count for ${id}`);
  }
}

test("cutoffs now include top 4, top 8 and top 16", () => {
  assert.deepEqual([...LEAGUE_KNOCKOUT_CUTOFFS], [4, 8, 16]);
});

test("league fixture counts: 18x8=72, 16x8=64, 12x5=30", () => {
  const cases = [
    { teams: 18, matchesPerTeam: 8, expected: 72 },
    { teams: 16, matchesPerTeam: 8, expected: 64 },
    { teams: 12, matchesPerTeam: 5, expected: 30 },
  ];
  for (const { teams, matchesPerTeam, expected } of cases) {
    const ids = teamIds(teams);
    assert.equal(expectedLeagueMatchCount(teams, matchesPerTeam), expected);
    const build = buildLeagueFixtures({ teamIds: ids, matchesPerTeam, knockoutCutoff: 8 });
    assert.equal(build.error, null, `no error for ${teams}x${matchesPerTeam}`);
    assert.equal(build.fixtures.length, expected);
    assertValidLeague(build.fixtures, ids, matchesPerTeam);
  }
});

function rankedTeams(count) {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `t${index + 1}`,
    rank: index + 1,
  }));
}

function finalSlotFor(matches, teamId) {
  // Follow the winner path from the team's first-round match to the final.
  const byKey = new Map(matches.map((m) => [m.key, m]));
  let match = matches.find((m) => m.homeId === teamId || m.awayId === teamId);
  let slot = null;
  while (match && match.nextKey) {
    slot = match.nextSlot;
    match = byKey.get(match.nextKey);
  }
  return match && match.round === "final" ? slot : null;
}

test("top 4, 8 and 16 knockout trees have the right match counts", () => {
  const counts = { 4: 4, 8: 8, 16: 16 };
  for (const cutoff of [4, 8, 16]) {
    const plan = buildLeagueKnockoutPlan(
      { format: cutoff, ...LEAGUE_COUNT_OPTIONS },
      rankedTeams(cutoff),
    );
    assert.equal(plan.error, null, `no error for top ${cutoff}`);
    assert.equal(plan.matches.length, counts[cutoff], `top ${cutoff} match count`);
    assert.equal(plan.matches.filter((m) => m.round === "final").length, 1);
    assert.equal(plan.matches.filter((m) => m.round === "third-place").length, 1);
  }
});

test("top 16 includes an eight-match round of 16 and third place totals 16", () => {
  const plan = buildLeagueKnockoutPlan({ format: 16, ...LEAGUE_COUNT_OPTIONS }, rankedTeams(16));
  assert.equal(plan.error, null);
  assert.equal(plan.matches.filter((m) => m.round === "round-of-16").length, 8);
  assert.equal(plan.matches.filter((m) => m.round === "quarterfinal").length, 4);
  assert.equal(plan.matches.filter((m) => m.round === "semifinal").length, 2);
  assert.equal(plan.matches.length, 16);
});

test("standard seeding keeps seed 1 and seed 2 apart until the final", () => {
  for (const cutoff of [4, 8, 16]) {
    const plan = buildLeagueKnockoutPlan({ format: cutoff, ...LEAGUE_COUNT_OPTIONS }, rankedTeams(cutoff));
    const slot1 = finalSlotFor(plan.matches, "t1");
    const slot2 = finalSlotFor(plan.matches, "t2");
    assert.ok(slot1 != null && slot2 != null, `both reach the final for top ${cutoff}`);
    assert.notEqual(slot1, slot2, `seed 1 and 2 are in opposite halves for top ${cutoff}`);
  }
});

test("same-club exclusion: every team plays the exact count with no intra-club or repeated games", () => {
  // 16 teams across 4 clubs of 4 each.
  const ids = teamIds(16);
  const clubByTeamId = {};
  ids.forEach((id, index) => {
    clubByTeamId[id] = `club-${index % 4}`;
  });
  const build = buildLeagueFixtures({
    teamIds: ids,
    matchesPerTeam: 8,
    knockoutCutoff: 8,
    restrictSameClub: true,
    clubByTeamId,
  });
  assert.equal(build.error, null, "a valid same-club draw exists");
  assert.equal(build.fixtures.length, 64);
  assertValidLeague(build.fixtures, ids, 8);
  for (const fixture of build.fixtures) {
    assert.notEqual(
      clubByTeamId[fixture.homeId],
      clubByTeamId[fixture.awayId],
      "no two teams of the same club meet",
    );
  }
});

test("same-club exclusion handles many teams of one club", () => {
  // One dominant club of 6 plus 10 singles; 5 games each.
  const ids = teamIds(16);
  const clubByTeamId = {};
  ids.forEach((id, index) => {
    clubByTeamId[id] = index < 6 ? "big-club" : `single-${index}`;
  });
  const build = buildLeagueFixtures({
    teamIds: ids,
    matchesPerTeam: 5,
    knockoutCutoff: 4,
    restrictSameClub: true,
    clubByTeamId,
  });
  assert.equal(build.error, null);
  assertValidLeague(build.fixtures, ids, 5);
  for (const fixture of build.fixtures) {
    assert.notEqual(clubByTeamId[fixture.homeId], clubByTeamId[fixture.awayId]);
  }
});

test("impossible same-club configuration fails with a clear error and no fixtures", () => {
  // 4 teams, two clubs of two, 3 games each: only 2 legal opponents exist.
  const ids = teamIds(4);
  const clubByTeamId = { "team-1": "a", "team-2": "a", "team-3": "b", "team-4": "b" };
  const build = buildLeagueFixtures({
    teamIds: ids,
    matchesPerTeam: 3,
    knockoutCutoff: 4,
    restrictSameClub: true,
    clubByTeamId,
  });
  assert.equal(build.fixtures.length, 0);
  assert.notEqual(build.error, null);
  assert.match(build.error, /vereinsinterner|Gegner/i);
});

test("classic league generation is unchanged when same-club is off", () => {
  const ids = teamIds(16);
  const clubByTeamId = {};
  ids.forEach((id, index) => (clubByTeamId[id] = `club-${index % 4}`));
  // restrictSameClub off: existing circle method, same-club pairings allowed.
  const build = buildLeagueFixtures({ teamIds: ids, matchesPerTeam: 8, knockoutCutoff: 8 });
  assert.equal(build.error, null);
  assert.equal(build.fixtures.length, 64);
  assertValidLeague(build.fixtures, ids, 8);
});
