import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChampionsLeagueBracketRows,
  buildDraftSchedulePdfDocument,
} from "../../src/lib/schedule/draft-schedule-pdf.ts";

const tournament = {
  id: "t1",
  slug: "synthetic",
  name: "Synthetic CL",
  ageGroup: "U13",
  date: "2026-12-28",
  location: "Testhalle",
  description: "Vollständige dynamische Turnierbeschreibung.",
  startTime: "09:00",
  playFormat: "6+1",
  matchDurationMinutes: 12,
  breakMinutes: 3,
};

const ref = (id) => ({ applicationId: id, externalTeamId: null });

test("draft PDF is built from edited in-memory matches, not persisted matches", () => {
  const preview = {
    mode: "champions-league",
    groups: [{ key: "league", name: "Liga", sortOrder: 0 }],
    memberships: ["a", "b", "c", "d"].map((id) => ({ groupKey: "league", participant: ref(id) })),
    matches: [
      { key: "m1", groupKey: "league", home: ref("a"), away: ref("b"), fieldId: "f1", scheduledAt: "2026-12-28T08:00:00.000Z", durationMinutes: 12, sortOrder: 0, restWarning: false },
      { key: "m2", groupKey: "league", home: ref("c"), away: ref("d"), fieldId: "f1", scheduledAt: "2026-12-28T08:15:00.000Z", durationMinutes: 12, sortOrder: 1, restWarning: false },
    ],
    qualifierPlan: { slots: [], firstRoundPairings: [] },
    koPlan: null,
    warnings: [],
    summary: { participantCount: 4, groupCount: 1, groupMatchCount: 2, koMatchCount: 0, totalMatchCount: 2, fieldCount: 2, firstKickoff: null, estimatedLastKickoff: null, estimatedEnd: null, warningCount: 0, matchesPerParticipant: 1, expectedLeagueMatchCount: 2, scheduledLeagueMatchCount: 2, knockoutCutoff: 4 },
    inputFingerprint: "synthetic",
  };
  const editedMatches = [
    { ...preview.matches[1], sortOrder: 0, home: ref("a"), away: ref("d"), fieldId: "f2", scheduledAt: "2026-12-28T10:17:00.000Z" },
    { ...preview.matches[0], sortOrder: 1 },
  ];
  const document = buildDraftSchedulePdfDocument({
    tournament,
    preview,
    editedMatches,
    teamLabels: { a: "Alpha", b: "Bravo", c: "Charlie", d: "Delta" },
    fields: [{ id: "f1", name: "Feld 1" }, { id: "f2", name: "Feld 2" }],
    matchesPerTeam: 1,
    knockoutCutoff: 4,
  });
  assert.equal(document.draft, true);
  assert.equal(document.singleColumnMatches[0].homeName, "Alpha");
  assert.equal(document.singleColumnMatches[0].awayName, "Delta");
  assert.equal(document.singleColumnMatches[0].fieldName, "Feld 2");
  assert.equal(document.singleColumnMatches[0].time, "11:17 Uhr");
  assert.equal(document.description, tournament.description);
  assert.ok(document.knockout.some((match) => match.homeName === "Platz 1" && match.awayName === "Platz 4"));
});

test("Top 4, Top 8 and Top 16 brackets include final and third-place placeholders", () => {
  for (const cutoff of [4, 8, 16]) {
    const rows = buildChampionsLeagueBracketRows(cutoff);
    assert.ok(rows.some((row) => row.round === "final" && row.homeName === "Sieger HF1"));
    assert.ok(rows.some((row) => row.round === "third-place" && row.homeName === "Verlierer HF1"));
    if (cutoff === 16) {
      assert.ok(rows.some((row) => row.round === "round-of-16" && row.awayName === "Platz 16"));
    }
  }
});
