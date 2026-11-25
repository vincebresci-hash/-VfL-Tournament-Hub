import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChampionsLeagueAdminPreview,
  savedTournamentPlanTiming,
} from "../../src/lib/schedule/league-admin-preview.ts";
import { buildLeagueFixtures } from "../../src/lib/schedule/league-phase.ts";

function participants(count) {
  return Array.from({ length: count }, (_, index) => ({
    applicationId: `team-${index + 1}`,
    externalTeamId: null,
  }));
}

function fields(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `field-${index + 1}`,
    name: `Feld ${index + 1}`,
  }));
}

function timing(overrides = {}) {
  return savedTournamentPlanTiming({
    date: "2026-12-05",
    startTime: "09:00",
    matchDurationMinutes: 9,
    breakMinutes: 1,
    minimumRestMinutes: 10,
    lunchBreakStart: null,
    lunchBreakEnd: null,
    ...overrides,
  });
}

function teamId(side) {
  return side.applicationId ?? side.externalTeamId;
}

function endMs(match) {
  return new Date(match.scheduledAt).getTime() + match.durationMinutes * 60000;
}

function startMs(match) {
  return new Date(match.scheduledAt).getTime();
}

function overlaps(a, b) {
  return startMs(a) < endMs(b) && startMs(b) < endMs(a);
}

/** Core timetable integrity used by every scenario. */
function assertScheduleIntegrity(preview, teamCount, matchesPerTeam, minimumRestMinutes) {
  const expected = preview.summary.expectedLeagueMatchCount;
  assert.equal(expected, (teamCount * matchesPerTeam) / 2, "expected league match count");
  assert.equal(preview.summary.scheduledLeagueMatchCount, expected, "all matches scheduled");
  assert.equal(preview.matches.length, expected, "match array length");
  assert.equal(
    preview.warnings.filter((w) =>
      ["LEAGUE_CONFIG_INVALID", "NO_FIELDS", "TIMETABLE_INCOMPLETE", "NO_PARTICIPANTS"].includes(w.code),
    ).length,
    0,
    "no blocking warnings",
  );

  const played = new Map();
  const pairs = new Set();
  const byField = new Map();
  const byTeam = new Map();
  for (const match of preview.matches) {
    assert.ok(match.fieldId, "match has a field");
    assert.ok(match.scheduledAt, "match has a kickoff");
    const home = teamId(match.home);
    const away = teamId(match.away);
    assert.notEqual(home, away, "no team plays itself");
    const pairKey = [home, away].sort().join("\u0000");
    assert.ok(!pairs.has(pairKey), `no repeated opponents: ${pairKey}`);
    pairs.add(pairKey);
    played.set(home, (played.get(home) ?? 0) + 1);
    played.set(away, (played.get(away) ?? 0) + 1);
    byField.set(match.fieldId, [...(byField.get(match.fieldId) ?? []), match]);
    byTeam.set(home, [...(byTeam.get(home) ?? []), match]);
    byTeam.set(away, [...(byTeam.get(away) ?? []), match]);
  }

  for (let i = 1; i <= teamCount; i += 1) {
    assert.equal(played.get(`team-${i}`), matchesPerTeam, `team-${i} plays exactly ${matchesPerTeam}`);
  }

  // No field hosts two overlapping matches.
  for (const [, list] of byField) {
    const sorted = [...list].sort((a, b) => startMs(a) - startMs(b));
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(!overlaps(sorted[i - 1], sorted[i]), "no field double-booking");
    }
  }

  // No team is in two matches at once; honoured rest gaps are respected.
  let restWarnings = 0;
  for (const [, list] of byTeam) {
    const sorted = [...list].sort((a, b) => startMs(a) - startMs(b));
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(!overlaps(sorted[i - 1], sorted[i]), "no simultaneous team match");
      const gapMin = (startMs(sorted[i]) - endMs(sorted[i - 1])) / 60000;
      if (!sorted[i].restWarning && !sorted[i - 1].restWarning) {
        assert.ok(gapMin >= minimumRestMinutes - 1e-6, `rest honoured when not flagged (${gapMin}min)`);
      }
    }
    restWarnings += sorted.filter((m) => m.restWarning).length;
  }
  return { restWarnings };
}

test("VfL scenario: 18 teams, 8 league games, 3 fields, 9+1 min, Top 16", () => {
  const preview = buildChampionsLeagueAdminPreview({
    participants: participants(18),
    matchesPerTeam: 8,
    knockoutCutoff: 16,
    fields: fields(3),
    timing: timing({ matchDurationMinutes: 9, breakMinutes: 1, minimumRestMinutes: 10 }),
  });
  assert.equal(preview.mode, "champions-league");
  const { restWarnings } = assertScheduleIntegrity(preview, 18, 8, 10);
  assert.equal(preview.summary.expectedLeagueMatchCount, 72);
  console.log(`18x8 Top16: 72 league matches scheduled, restWarnings=${restWarnings}`);
});

test("VfL scenario: 16 teams, 8 league games, 2 fields, 20 min rest and a lunch break", () => {
  const preview = buildChampionsLeagueAdminPreview({
    participants: participants(16),
    matchesPerTeam: 8,
    knockoutCutoff: 8,
    fields: fields(2),
    timing: timing({
      matchDurationMinutes: 10,
      breakMinutes: 2,
      minimumRestMinutes: 20,
      lunchBreakStart: "12:00",
      lunchBreakEnd: "12:45",
    }),
  });
  const { restWarnings } = assertScheduleIntegrity(preview, 16, 8, 20);
  assert.equal(preview.summary.expectedLeagueMatchCount, 64);
  console.log(`16x8 Top8 (2 fields, 20min rest, lunch): 64 matches, restWarnings=${restWarnings}`);
});

test("VfL scenario: 12 teams, 5 league games, Top 8", () => {
  const preview = buildChampionsLeagueAdminPreview({
    participants: participants(12),
    matchesPerTeam: 5,
    knockoutCutoff: 8,
    fields: fields(2),
    timing: timing(),
  });
  assertScheduleIntegrity(preview, 12, 5, 10);
  assert.equal(preview.summary.expectedLeagueMatchCount, 30);
});

test("same-club exclusion in a scheduled preview keeps clubs apart and the schedule valid", () => {
  const roster = participants(16);
  const clubByParticipantId = {};
  roster.forEach((p, index) => {
    clubByParticipantId[p.applicationId] = `club-${index % 4}`;
  });
  const preview = buildChampionsLeagueAdminPreview({
    participants: roster,
    matchesPerTeam: 6,
    knockoutCutoff: 8,
    fields: fields(3),
    timing: timing(),
    restrictSameClub: true,
    clubByParticipantId,
  });
  assertScheduleIntegrity(preview, 16, 6, 10);
  for (const match of preview.matches) {
    assert.notEqual(
      clubByParticipantId[teamId(match.home)],
      clubByParticipantId[teamId(match.away)],
      "no two teams of the same club are scheduled",
    );
  }
});

test("complex but solvable same-club configurations are found reliably", () => {
  // Clubs of sizes 5,4,3,2,1,1 (16 teams); 7 games each — solvable but tight.
  const sizes = [5, 4, 3, 2, 1, 1];
  const ids = [];
  const clubByTeamId = {};
  let n = 0;
  sizes.forEach((size, clubIndex) => {
    for (let i = 0; i < size; i += 1) {
      const id = `team-${++n}`;
      ids.push(id);
      clubByTeamId[id] = `club-${clubIndex}`;
    }
  });
  for (const matchesPerTeam of [4, 6, 8, 10]) {
    const build = buildLeagueFixtures({
      teamIds: ids,
      matchesPerTeam,
      knockoutCutoff: 8,
      restrictSameClub: true,
      clubByTeamId,
    });
    assert.equal(build.error, null, `solvable same-club draw found for ${matchesPerTeam} games`);
    assert.equal(build.fixtures.length, (ids.length * matchesPerTeam) / 2);
    for (const f of build.fixtures) {
      assert.notEqual(clubByTeamId[f.homeId], clubByTeamId[f.awayId]);
    }
  }
});

test("provably impossible is reported differently from an exhausted search", () => {
  // Provable: a club of 10 of 12 teams -> each of those has only 2 legal opponents.
  const ids = Array.from({ length: 12 }, (_, i) => `team-${i + 1}`);
  const clubByTeamId = {};
  ids.forEach((id, i) => (clubByTeamId[id] = i < 10 ? "big" : `single-${i}`));
  const provable = buildLeagueFixtures({
    teamIds: ids,
    matchesPerTeam: 5,
    knockoutCutoff: 4,
    restrictSameClub: true,
    clubByTeamId,
  });
  assert.equal(provable.code, "SAME_CLUB_TOO_FEW_OPPONENTS");
  assert.match(provable.error, /nachweislich unmöglich/i);
});

test("classic group tournament scheduling is unchanged (regression)", () => {
  // round-robin with no CL config still produces a clean schedule-less league check.
  const build = buildLeagueFixtures({ teamIds: ["a", "b", "c", "d"], matchesPerTeam: 3, knockoutCutoff: 4 });
  assert.equal(build.error, null);
  assert.equal(build.fixtures.length, 6);
});
