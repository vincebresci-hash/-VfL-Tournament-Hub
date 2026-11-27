import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLeagueKnockoutPlan } from "../../src/lib/schedule/league-phase.ts";
import { buildKnockoutTimetable } from "../../src/lib/schedule/knockout-timetable.ts";

function ranked(n) {
  return Array.from({ length: n }, (_, i) => ({ participantId: `t${i + 1}`, rank: i + 1 }));
}

function firstRoundPairs(plan) {
  return plan.matches
    .filter((m) => m.homeId != null && m.awayId != null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => [m.homeId, m.awayId]);
}

test("Champions League seeding: Top 4 → 1v4, 2v3", () => {
  const plan = buildLeagueKnockoutPlan({ format: 4, includeThirdPlace: true }, ranked(4));
  assert.equal(plan.error, null);
  assert.deepEqual(firstRoundPairs(plan), [["t1", "t4"], ["t2", "t3"]]);
});

test("Champions League seeding: Top 8 → 1v8, 4v5, 2v7, 3v6", () => {
  const plan = buildLeagueKnockoutPlan({ format: 8, includeThirdPlace: true }, ranked(8));
  assert.equal(plan.error, null);
  assert.deepEqual(firstRoundPairs(plan), [
    ["t1", "t8"],
    ["t4", "t5"],
    ["t2", "t7"],
    ["t3", "t6"],
  ]);
});

test("Champions League seeding: Top 16 standard bracket, seeds 1 and 2 only meet in the final", () => {
  const plan = buildLeagueKnockoutPlan({ format: 16, includeThirdPlace: true }, ranked(16));
  assert.equal(plan.error, null);
  assert.deepEqual(firstRoundPairs(plan), [
    ["t1", "t16"],
    ["t8", "t9"],
    ["t4", "t13"],
    ["t5", "t12"],
    ["t2", "t15"],
    ["t7", "t10"],
    ["t3", "t14"],
    ["t6", "t11"],
  ]);
});

test("Top 16 end round receives complete fields and kickoff times in dependency waves", () => {
  const plan = buildLeagueKnockoutPlan({ format: 16, includeThirdPlace: true }, ranked(16));
  assert.equal(plan.error, null);
  const fields = [1, 2, 3].map((number) => ({ id: `f${number}`, name: `Feld ${number}` }));
  const durationMinutes = 12;
  const minimumRestMinutes = 15;
  const timed = buildKnockoutTimetable(plan.matches, fields, {
    start: new Date("2026-12-28T12:00:00.000Z"),
    durationMinutes,
    breakMinutes: 3,
    minimumRestMinutes,
  });

  assert.equal(timed.matches.length, plan.matches.length);
  assert.equal(timed.warnings.length, 0);
  assert.equal(timed.matches.filter((match) => plan.matches.find((item) => item.key === match.key)?.round === "round-of-16").length, 8);
  assert.ok(timed.matches.every((match) => fields.some((field) => field.id === match.fieldId)));

  const timesByRound = (round) => timed.matches
    .filter((match) => plan.matches.find((item) => item.key === match.key)?.round === round)
    .map((match) => match.scheduledAt.getTime());
  const roundOf16 = timesByRound("round-of-16");
  const quarterfinals = timesByRound("quarterfinal");
  const semifinals = timesByRound("semifinal");
  const finals = [...timesByRound("third-place"), ...timesByRound("final")];
  const requiredGap = (durationMinutes + minimumRestMinutes) * 60_000;

  assert.ok(Math.min(...quarterfinals) >= Math.max(...roundOf16) + requiredGap);
  assert.ok(Math.min(...semifinals) >= Math.max(...quarterfinals) + requiredGap);
  assert.ok(Math.min(...finals) >= Math.max(...semifinals) + requiredGap);
});

test("Top 8 placement matches are included in the complete timetable", () => {
  const plan = buildLeagueKnockoutPlan(
    { format: 8, includeThirdPlace: true, includePlacement5: true, includePlacement7: true },
    ranked(8),
  );
  assert.equal(plan.error, null);
  const timed = buildKnockoutTimetable(plan.matches, [{ id: "f1", name: "Feld 1" }], {
    start: new Date("2026-12-28T12:00:00.000Z"),
    durationMinutes: 12,
    breakMinutes: 3,
    minimumRestMinutes: 15,
  });
  assert.equal(timed.matches.length, plan.matches.length);
  assert.equal(timed.warnings.length, 0);
  assert.ok(plan.matches.some((match) => match.round === "placement-5"));
  assert.ok(plan.matches.some((match) => match.round === "placement-7"));
});
