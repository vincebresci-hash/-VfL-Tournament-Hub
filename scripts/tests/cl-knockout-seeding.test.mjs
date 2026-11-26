import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLeagueKnockoutPlan } from "../../src/lib/schedule/league-phase.ts";

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
