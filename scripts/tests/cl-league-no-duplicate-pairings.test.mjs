import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildLeagueFixtures } from "../../src/lib/schedule/league-phase.ts";
import {
  findDuplicateLeaguePairing,
  isSelfPairing,
  pairingKey,
} from "../../src/lib/schedule/league-pairing-guard.ts";

function ids(n) {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

/** Assert a league fixture set obeys the P0 invariants (ID-based). */
function assertLeagueInvariants(fixtures, teamIds, matchesPerTeam) {
  const seenPairs = new Set();
  const degree = new Map(teamIds.map((id) => [id, 0]));
  for (const fx of fixtures) {
    assert.notEqual(fx.homeId, fx.awayId, "no self-play");
    assert.ok(degree.has(fx.homeId) && degree.has(fx.awayId), "known teams only");
    const key = pairingKey(fx.homeId, fx.awayId);
    assert.ok(!seenPairs.has(key), `no duplicate pairing: ${fx.homeId} vs ${fx.awayId}`);
    seenPairs.add(key);
    degree.set(fx.homeId, degree.get(fx.homeId) + 1);
    degree.set(fx.awayId, degree.get(fx.awayId) + 1);
  }
  assert.equal(fixtures.length, (teamIds.length * matchesPerTeam) / 2, "exact match count");
  for (const id of teamIds) {
    assert.equal(degree.get(id), matchesPerTeam, `${id} plays exactly ${matchesPerTeam} different opponents`);
  }
}

const CASES = [
  { teams: 11, mpt: 4, games: 22 },
  { teams: 16, mpt: 8, games: 64 },
  { teams: 18, mpt: 5, games: 45 },
  { teams: 18, mpt: 8, games: 72 },
];

for (const { teams, mpt, games } of CASES) {
  test(`league phase ${teams}×${mpt} = ${games} Spiele: unique opponents, no repeats`, () => {
    const teamIds = ids(teams);
    const built = buildLeagueFixtures({ teamIds, matchesPerTeam: mpt, knockoutCutoff: teams >= 16 ? 16 : 8 });
    assert.equal(built.error, null, built.error ?? "");
    assert.equal(built.fixtures.length, games);
    assertLeagueInvariants(built.fixtures, teamIds, mpt);
  });
}

test("same-club exclusion holds without introducing duplicates", () => {
  const teamIds = ids(16);
  // Two clubs of 8; every team still needs 8 distinct opponents.
  const clubByTeamId = Object.fromEntries(teamIds.map((id, i) => [id, i < 8 ? "club-a" : "club-b"]));
  const built = buildLeagueFixtures({
    teamIds,
    matchesPerTeam: 8,
    knockoutCutoff: 8,
    restrictSameClub: true,
    clubByTeamId,
  });
  assert.equal(built.error, null, built.error ?? "");
  assertLeagueInvariants(built.fixtures, teamIds, 8);
  for (const fx of built.fixtures) {
    assert.notEqual(clubByTeamId[fx.homeId], clubByTeamId[fx.awayId], "no intra-club pairing");
  }
});

test("impossible same-club configuration fails with a clear error, never relaxed", () => {
  const teamIds = ids(6);
  // 5 of 6 teams share a club → impossible to give each 4 distinct cross-club opponents.
  const clubByTeamId = Object.fromEntries(teamIds.map((id, i) => [id, i < 5 ? "big" : `solo-${i}`]));
  const built = buildLeagueFixtures({
    teamIds,
    matchesPerTeam: 4,
    knockoutCutoff: 4,
    restrictSameClub: true,
    clubByTeamId,
  });
  assert.notEqual(built.error, null);
  assert.equal(built.fixtures.length, 0);
});

// --- Manual-edit / manual-add guard (ID-based) ---
test("guard detects a duplicate pairing in either home/away order", () => {
  const matches = [
    { id: "m1", phase: "group", homeId: "a", awayId: "b" },
    { id: "m2", phase: "group", homeId: "c", awayId: "d" },
  ];
  // Same pairing, reversed order, is a duplicate.
  assert.equal(findDuplicateLeaguePairing({ matches, homeId: "b", awayId: "a" }), "m1");
  assert.equal(findDuplicateLeaguePairing({ matches, homeId: "a", awayId: "b" }), "m1");
  // A genuinely new pairing is allowed.
  assert.equal(findDuplicateLeaguePairing({ matches, homeId: "a", awayId: "c" }), null);
});

test("guard excludes the edited match and the knockout phase", () => {
  const matches = [
    { id: "m1", phase: "group", homeId: "a", awayId: "b" },
    { id: "ko1", phase: "knockout", homeId: "a", awayId: "c" },
  ];
  // Editing m1 to the same (or swapped) pairing is a no-op, not a duplicate.
  assert.equal(findDuplicateLeaguePairing({ matches, homeId: "b", awayId: "a", excludeMatchId: "m1" }), null);
  // A knockout rematch of a league pairing is allowed (KO exempt).
  assert.equal(findDuplicateLeaguePairing({ matches, homeId: "a", awayId: "c" }), null);
  assert.equal(isSelfPairing("a", "a"), true);
  assert.equal(isSelfPairing("a", "b"), false);
});

test("saveTournamentMatchAction enforces the pairing guard (source wiring)", () => {
  const src = readFileSync(new URL("../../src/lib/db/schedule-actions.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function saveTournamentMatchAction"));
  assert.ok(fn.includes("findDuplicateLeaguePairing("), "manual save must call the pairing guard");
  assert.ok(
    fn.indexOf("findDuplicateLeaguePairing(") < fn.indexOf("tournament_matches"),
    "the guard must run before the write",
  );
});
