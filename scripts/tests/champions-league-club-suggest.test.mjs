import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clubAssignmentProgress,
  clubCanonicalKey,
  findDuplicateClubs,
  participantsMissingClub,
  suggestClubAssignments,
} from "../../src/lib/schedule/club-assignment-suggest.ts";

const CLUBS = [
  { id: "c-vfl", name: "VfL Kirchheim" },
  { id: "c-tsv", name: "TSV Weilheim" },
  { id: "c-fc", name: "FC Bayern München" },
];

test("VfL Kirchheim 1 and 2 both map to the same club (exact, safe)", () => {
  const suggestions = suggestClubAssignments({
    participants: [
      { participantId: "p1", teamName: "VfL Kirchheim 1", clubId: null },
      { participantId: "p2", teamName: "VfL Kirchheim 2", clubId: null },
    ],
    clubs: CLUBS,
  });
  assert.equal(suggestions.length, 2);
  for (const s of suggestions) {
    assert.equal(s.suggestedClubId, "c-vfl");
    assert.equal(s.confidence, "exact");
    assert.equal(s.safe, true);
  }
});

test("roman and U-age variants also resolve to the base club", () => {
  const suggestions = suggestClubAssignments({
    participants: [
      { participantId: "p1", teamName: "VfL Kirchheim II", clubId: null },
      { participantId: "p2", teamName: "VfL Kirchheim U13", clubId: null },
    ],
    clubs: CLUBS,
  });
  assert.equal(suggestions[0].suggestedClubId, "c-vfl");
  assert.equal(suggestions[1].suggestedClubId, "c-vfl");
});

test("already-assigned participants are skipped", () => {
  const suggestions = suggestClubAssignments({
    participants: [
      { participantId: "p1", teamName: "VfL Kirchheim 1", clubId: "c-vfl" },
      { participantId: "p2", teamName: "TSV Weilheim", clubId: null },
    ],
    clubs: CLUBS,
  });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].participantId, "p2");
  assert.equal(suggestions[0].suggestedClubId, "c-tsv");
});

test("an uncertain match is suggested but never marked safe", () => {
  const suggestions = suggestClubAssignments({
    participants: [{ participantId: "p1", teamName: "Bayern Jugend", clubId: null }],
    clubs: CLUBS,
  });
  assert.equal(suggestions.length, 1);
  assert.notEqual(suggestions[0].confidence, "exact");
  assert.equal(suggestions[0].safe, false);
});

test("no plausible match yields a none suggestion, never a silent assignment", () => {
  const suggestions = suggestClubAssignments({
    participants: [{ participantId: "p1", teamName: "Rot-Weiss Ahlen", clubId: null }],
    clubs: CLUBS,
  });
  assert.equal(suggestions[0].suggestedClubId, null);
  assert.equal(suggestions[0].confidence, "none");
  assert.equal(suggestions[0].safe, false);
});

test("a club-name hint is used when the team name differs", () => {
  const suggestions = suggestClubAssignments({
    participants: [
      { participantId: "p1", teamName: "Die Löwen", clubNameHint: "TSV Weilheim", clubId: null },
    ],
    clubs: CLUBS,
  });
  assert.equal(suggestions[0].suggestedClubId, "c-tsv");
  assert.equal(suggestions[0].confidence, "exact");
});

test("participantsMissingClub returns only unassigned teams", () => {
  const missing = participantsMissingClub([
    { participantId: "p1", teamName: "A", clubId: "c1" },
    { participantId: "p2", teamName: "B", clubId: null },
    { participantId: "p3", teamName: "C", clubId: null },
  ]);
  assert.deepEqual(missing.map((m) => m.participantId), ["p2", "p3"]);
});

// CL Release 6 §1 — generic club-type prefixes must not justify a match.
test("a shared generic prefix (TSV/VfL/SGM/FC) alone yields no suggestion", () => {
  const clubs = [
    { id: "c-weil", name: "TSV Weilheim" },
    { id: "c-ot", name: "TSV Ötlingen" },
  ];
  const suggestions = suggestClubAssignments({
    participants: [{ participantId: "p1", teamName: "TSV Nabern", clubId: null }],
    clubs,
  });
  // "TSV" is shared with both clubs but is generic — no distinctive overlap.
  assert.equal(suggestions[0].suggestedClubId, null);
  assert.equal(suggestions[0].confidence, "none");
});

test("a distinctive token still matches despite a shared generic prefix", () => {
  const clubs = [
    { id: "c-weil", name: "TSV Weilheim" },
    { id: "c-ot", name: "TSV Ötlingen" },
  ];
  const suggestions = suggestClubAssignments({
    participants: [{ participantId: "p1", teamName: "TSV Ötlingen B-Jugend", clubId: null }],
    clubs,
  });
  assert.equal(suggestions[0].suggestedClubId, "c-ot");
});

test("duplicate clubs are detected before create and never auto-merged", () => {
  const clubs = [
    { id: "c1", name: "VfL Kirchheim" },
    { id: "c2", name: "VfL Kirchheim" },
    { id: "c3", name: "TSV Weilheim" },
  ];
  const dupes = findDuplicateClubs("VfL Kirchheim 1", clubs);
  assert.equal(dupes.length, 2);
  assert.deepEqual(dupes.map((c) => c.id).sort(), ["c1", "c2"]);
  assert.equal(clubCanonicalKey("VfL Kirchheim") === clubCanonicalKey("VfL Kirchheim 2"), true);
  assert.equal(findDuplicateClubs("FC Neuhausen", clubs).length, 0);
});

test("assignment progress reports assigned of total", () => {
  const progress = clubAssignmentProgress([
    { participantId: "p1", teamName: "A", clubId: "c1" },
    { participantId: "p2", teamName: "B", clubId: "c1" },
    { participantId: "p3", teamName: "C", clubId: null },
  ]);
  assert.deepEqual(progress, { assigned: 2, total: 3 });
});
