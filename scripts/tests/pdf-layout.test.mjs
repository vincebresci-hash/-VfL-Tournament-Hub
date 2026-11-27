import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assignGameNumbers,
  groupMatchesByTimeslot,
  pdfLayoutShowsStandings,
  resolvePdfLayout,
} from "../../src/lib/schedule/pdf-layout.ts";

test("layout maps from the actual tournament data", () => {
  assert.equal(resolvePdfLayout({ competitionFormat: "champions-league", groupCount: 1, fieldCount: 1 }), "cl-single");
  assert.equal(resolvePdfLayout({ competitionFormat: "champions-league", groupCount: 1, fieldCount: 3 }), "cl-multi");
  assert.equal(resolvePdfLayout({ competitionFormat: "groups-knockout", groupCount: 2, fieldCount: 2 }), "groups");
  assert.equal(resolvePdfLayout({ competitionFormat: null, groupCount: 0, fieldCount: 1 }), "groups");
  assert.equal(
    resolvePdfLayout({ competitionFormat: "round-robin", groupCount: 0, fieldCount: 1, ageGroup: "Bambini" }),
    "bambini",
  );
  assert.equal(
    resolvePdfLayout({ competitionFormat: "round-robin", groupCount: 1, fieldCount: 1, ageGroup: "F-Jugend" }),
    "groups",
    "F-Jugend is not implicitly Bambini",
  );
  assert.equal(
    resolvePdfLayout({ competitionFormat: "round-robin", groupCount: 1, fieldCount: 1, ageGroup: "F-Jugend", playFormat: "Kinderfestival ohne Ergebnisse" }),
    "bambini",
    "an explicit no-results format selects Bambini layout",
  );
  assert.equal(pdfLayoutShowsStandings("bambini"), false);
  assert.equal(pdfLayoutShowsStandings("cl-multi"), true);
});

test("multi-field timeline never drops conflicts or missing field assignments", () => {
  const matches = [
    { key: "m1", scheduledAt: "2026-12-27T09:00:00Z", fieldId: "f1", sortOrder: 0 },
    { key: "m2", scheduledAt: "2026-12-27T09:00:00Z", fieldId: "f1", sortOrder: 1 },
    { key: "m3", scheduledAt: "2026-12-27T09:00:00Z", fieldId: null, sortOrder: 2 },
    { key: "m4", scheduledAt: null, fieldId: null, sortOrder: 3 },
  ];
  const rows = groupMatchesByTimeslot(matches, ["f1", "f2"]);
  const rendered = rows.flatMap((row) => row.cells.map((cell) => cell.match?.key).filter(Boolean));
  assert.deepEqual(rendered.sort(), ["m1", "m2", "m3", "m4"]);
});

test("multi-field timeline groups by kickoff with one cell per field", () => {
  const fields = ["f1", "f2"];
  const matches = [
    { key: "m1", scheduledAt: "2026-12-27T09:00:00Z", fieldId: "f1", sortOrder: 0 },
    { key: "m2", scheduledAt: "2026-12-27T09:00:00Z", fieldId: "f2", sortOrder: 1 },
    { key: "m3", scheduledAt: "2026-12-27T09:20:00Z", fieldId: "f1", sortOrder: 2 },
  ];
  const rows = groupMatchesByTimeslot(matches, fields);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].scheduledAt, "2026-12-27T09:00:00Z");
  assert.equal(rows[0].cells[0].match?.key, "m1");
  assert.equal(rows[0].cells[1].match?.key, "m2");
  assert.equal(rows[1].cells[0].match?.key, "m3");
  assert.equal(rows[1].cells[1].match, null);
});

test("game numbers are 1-based in schedule order", () => {
  const matches = [
    { key: "b", scheduledAt: "2026-12-27T09:20:00Z", fieldId: "f1", sortOrder: 2 },
    { key: "a", scheduledAt: "2026-12-27T09:00:00Z", fieldId: "f1", sortOrder: 0 },
  ];
  const numbers = assignGameNumbers(matches);
  assert.equal(numbers.get("a"), 1);
  assert.equal(numbers.get("b"), 2);
});

test("print stylesheet renders exactly one page counter with total pages", () => {
  const documentSource = readFileSync(
    new URL("../../src/components/admin/SchedulePdfDocument.tsx", import.meta.url),
    "utf8",
  );
  const artifactSource = readFileSync(
    new URL("../../e2e/release6-pdf.spec.ts", import.meta.url),
    "utf8",
  );

  assert.match(documentSource, /content:\s*"Seite "\s*counter\(page\)\s*" \/ "\s*counter\(pages\)/);
  assert.doesNotMatch(artifactSource, /displayHeaderFooter|footerTemplate/);
});

test("stored Top-16 matches retain their round when read from PostgreSQL", () => {
  const querySource = readFileSync(
    new URL("../../src/lib/db/schedule-queries.ts", import.meta.url),
    "utf8",
  );
  assert.match(querySource, /value === "round-of-16"/);
});
