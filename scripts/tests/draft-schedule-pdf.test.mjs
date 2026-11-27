import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChampionsLeagueBracketRows,
  buildClassicBracketRows,
  buildDraftSchedulePdfDocument,
  completePdfKnockoutRows,
  sortPdfKnockoutSchedule,
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

  const groupOnly = buildDraftSchedulePdfDocument({
    tournament,
    preview: { ...preview, mode: "round-robin", koPlan: null },
    teamLabels: { a: "Alpha", b: "Bravo", c: "Charlie", d: "Delta" },
    fields: [{ id: "f1", name: "Feld 1" }],
    matchesPerTeam: null,
    knockoutCutoff: null,
  });
  assert.equal(groupOnly.knockout.length, 0, "round-robin drafts must not invent a knockout stage");
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

test("legacy single-group tournaments receive a complete Top-4 end round", () => {
  const rows = buildClassicBracketRows(1);
  assert.deepEqual(
    rows.map((row) => row.round),
    ["semifinal", "semifinal", "final", "third-place"],
  );
  assert.equal(rows[0].homeName, "Platz 1");
  assert.equal(rows[0].awayName, "Platz 4");
});

test("partial persisted knockout data is completed without losing its schedule or result", () => {
  const template = buildChampionsLeagueBracketRows(8);
  const persisted = [{
    ...template.find((row) => row.round === "quarterfinal"),
    key: "stored-vf-1",
    number: 0,
    time: "17:15 Uhr",
    fieldName: "Hauptfeld",
    homeName: "Alpha",
    awayName: "Bravo",
    result: "2:1",
  }];
  const rows = completePdfKnockoutRows(template, persisted, 65);
  const stored = rows.find((row) => row.key === "stored-vf-1");
  assert.equal(rows.length, template.length);
  assert.equal(stored.time, "17:15 Uhr");
  assert.equal(stored.fieldName, "Hauptfeld");
  assert.equal(stored.result, "2:1");
  assert.equal(rows[0].number, 65);
  assert.ok(rows.some((row) => row.round === "final"));
});

test("end-round schedule is chronological and keeps open matches last", () => {
  const rows = sortPdfKnockoutSchedule([
    { key: "open", number: 23, time: "Termin offen" },
    { key: "late", number: 22, time: "17:30 Uhr" },
    { key: "early", number: 21, time: "16:45 Uhr" },
  ]);
  assert.deepEqual(rows.map((row) => row.key), ["early", "late", "open"]);
});
