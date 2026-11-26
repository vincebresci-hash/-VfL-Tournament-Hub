import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reorderMatch,
  recomputeTimes,
  swapTimeSlots,
  toEditableMatches,
  validateEditedLeaguePlan,
} from "../../src/lib/schedule/league-preview-edit.ts";
import { buildChampionsLeagueAdminPreview } from "../../src/lib/schedule/league-admin-preview.ts";

const TIMING = {
  startIso: "2026-12-27T08:00:00.000Z",
  durationMinutes: 12,
  breakMinutes: 3,
  minimumRestMinutes: 15,
  lunchStartIso: null,
  lunchEndIso: null,
};

function app(id) {
  return { applicationId: id, externalTeamId: null };
}

function buildPreview(teamCount, matchesPerTeam, fieldCount) {
  return buildChampionsLeagueAdminPreview({
    participants: Array.from({ length: teamCount }, (_, i) => app(`t${i + 1}`)),
    matchesPerTeam,
    knockoutCutoff: 4,
    fields: Array.from({ length: fieldCount }, (_, i) => ({ id: `f${i + 1}`, name: `Platz ${i + 1}` })),
    timing: TIMING,
  });
}

function ids(n) {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

test("a freshly generated preview passes edit re-validation unchanged", () => {
  const preview = buildPreview(8, 3, 3); // 12 matches
  const matches = toEditableMatches(preview.matches);
  const result = validateEditedLeaguePlan({
    matches,
    participantIds: ids(8),
    matchesPerTeam: 3,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 15,
    restrictSameClub: false,
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
});

test("reordering then recomputing times stays valid", () => {
  const preview = buildPreview(10, 4, 3); // 20 matches
  let matches = toEditableMatches(preview.matches);
  assert.equal(matches.length, 20);
  matches = reorderMatch(matches, matches[5].key, "up");
  matches = reorderMatch(matches, matches[0].key, "down");
  matches = recomputeTimes(matches, TIMING, [
    { id: "f1", name: "Platz 1" },
    { id: "f2", name: "Platz 2" },
    { id: "f3", name: "Platz 3" },
  ]);
  const result = validateEditedLeaguePlan({
    matches,
    participantIds: ids(10),
    matchesPerTeam: 4,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 15,
    restrictSameClub: false,
  });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  // Every pairing still present exactly once.
  assert.equal(new Set(matches.map((m) => m.key)).size, 20);
});

test("a manual kickoff edit that double-books a field is rejected", () => {
  const preview = buildPreview(8, 3, 3);
  const matches = toEditableMatches(preview.matches);
  // Force two matches onto the same field at the same time.
  const a = { ...matches[0], fieldId: "f1", scheduledAt: "2026-12-27T08:00:00.000Z" };
  const b = { ...matches[1], fieldId: "f1", scheduledAt: "2026-12-27T08:05:00.000Z" };
  const edited = [a, b, ...matches.slice(2)];
  const result = validateEditedLeaguePlan({
    matches: edited,
    participantIds: ids(8),
    matchesPerTeam: 3,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 0,
    restrictSameClub: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "FIELD_DOUBLE_BOOKED"));
});

test("a team appearing twice at once is rejected", () => {
  const preview = buildPreview(8, 3, 3);
  const matches = toEditableMatches(preview.matches);
  // Find two matches that share a team, force same kickoff on different fields.
  const first = matches[0];
  const sharedTeam = first.home.applicationId;
  const second = matches.find((m, idx) => idx > 0 && (m.home.applicationId === sharedTeam || m.away.applicationId === sharedTeam));
  assert.ok(second, "expected a second match with the shared team");
  const edited = matches.map((m) => {
    if (m.key === first.key) return { ...m, fieldId: "f1", scheduledAt: "2026-12-27T08:00:00.000Z" };
    if (m.key === second.key) return { ...m, fieldId: "f2", scheduledAt: "2026-12-27T08:00:00.000Z" };
    return m;
  });
  const result = validateEditedLeaguePlan({
    matches: edited,
    participantIds: ids(8),
    matchesPerTeam: 3,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 0,
    restrictSameClub: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "TEAM_DOUBLE_BOOKED"));
});

test("minimum rest violations are reported", () => {
  const preview = buildPreview(8, 3, 3);
  const matches = toEditableMatches(preview.matches);
  const first = matches[0];
  const team = first.home.applicationId;
  const second = matches.find((m, idx) => idx > 0 && (m.home.applicationId === team || m.away.applicationId === team));
  const edited = matches.map((m) => {
    if (m.key === first.key) return { ...m, fieldId: "f1", scheduledAt: "2026-12-27T08:00:00.000Z", durationMinutes: 12 };
    // 1 minute after the first ends -> below a 15 minute rest.
    if (m.key === second.key) return { ...m, fieldId: "f2", scheduledAt: "2026-12-27T08:13:00.000Z", durationMinutes: 12 };
    return m;
  });
  const result = validateEditedLeaguePlan({
    matches: edited,
    participantIds: ids(8),
    matchesPerTeam: 3,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 15,
    restrictSameClub: false,
  });
  assert.ok(result.issues.some((i) => i.code === "MINIMUM_REST_VIOLATION"));
});

test("duplicate pairing and wrong opponent count are rejected", () => {
  const preview = buildPreview(8, 3, 3);
  const matches = toEditableMatches(preview.matches);
  // Overwrite match[1] to duplicate match[0]'s pairing.
  const edited = matches.map((m, idx) =>
    idx === 1 ? { ...m, home: matches[0].home, away: matches[0].away } : m,
  );
  const result = validateEditedLeaguePlan({
    matches: edited,
    participantIds: ids(8),
    matchesPerTeam: 3,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 0,
    restrictSameClub: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "DUPLICATE_PAIRING"));
  assert.ok(result.issues.some((i) => i.code === "WRONG_OPPONENT_COUNT"));
});

test("same-club pairing is rejected under the restriction", () => {
  const preview = buildPreview(8, 3, 3);
  const matches = toEditableMatches(preview.matches);
  const clubByParticipantId = Object.fromEntries(ids(8).map((id) => [id, id === "t1" || id === "t2" ? "vfl" : `club-${id}`]));
  // Force a t1 vs t2 (same club) pairing into the plan.
  const edited = matches.map((m, idx) =>
    idx === 0 ? { ...m, home: { applicationId: "t1", externalTeamId: null }, away: { applicationId: "t2", externalTeamId: null } } : m,
  );
  const result = validateEditedLeaguePlan({
    matches: edited,
    participantIds: ids(8),
    matchesPerTeam: 3,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 0,
    restrictSameClub: true,
    clubByParticipantId,
  });
  assert.ok(result.issues.some((i) => i.code === "SAME_CLUB_VIOLATION"));
});

test("swapping two time slots keeps pairings but exchanges kickoff and field", () => {
  const preview = buildPreview(8, 3, 2);
  const matches = toEditableMatches(preview.matches);
  const a = matches[0];
  const b = matches[1];
  const swapped = swapTimeSlots(matches, a.key, b.key);
  const newA = swapped.find((m) => m.key === a.key);
  const newB = swapped.find((m) => m.key === b.key);
  assert.equal(newA.scheduledAt, b.scheduledAt);
  assert.equal(newA.fieldId, b.fieldId);
  assert.equal(newB.scheduledAt, a.scheduledAt);
  assert.equal(newB.fieldId, a.fieldId);
  // Pairing identity unchanged.
  assert.deepEqual(newA.home, a.home);
  assert.deepEqual(newA.away, a.away);
});

test("count mismatch is reported", () => {
  const preview = buildPreview(8, 3, 3);
  const matches = toEditableMatches(preview.matches).slice(0, 11); // drop one
  const result = validateEditedLeaguePlan({
    matches,
    participantIds: ids(8),
    matchesPerTeam: 3,
    fieldIds: ["f1", "f2", "f3"],
    minimumRestMinutes: 0,
    restrictSameClub: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.code === "MATCH_COUNT_MISMATCH"));
});
