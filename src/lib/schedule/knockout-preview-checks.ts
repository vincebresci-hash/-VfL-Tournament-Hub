import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildKnockoutPlan,
  isGroupStageComplete,
  qualifyTopTwo,
  type KnockoutOptions,
} from "@/lib/schedule/knockout";
import {
  buildKnockoutQualificationPreview,
  type KnockoutPreviewMatch,
} from "@/lib/schedule/knockout-preview";
import { computeGroupStandings } from "@/lib/schedule/standings";
import type { MatchStatus, StandingRow } from "@/types/schedule";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`knockout-preview-checks: ${message}`);
  }
}

function match(partial: {
  groupId: string | null;
  homeApplicationId?: string | null;
  awayApplicationId?: string | null;
  homeExternalTeamId?: string | null;
  awayExternalTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  status: MatchStatus;
  phase?: string;
}): KnockoutPreviewMatch {
  return {
    groupId: partial.groupId,
    homeApplicationId: partial.homeApplicationId ?? null,
    awayApplicationId: partial.awayApplicationId ?? null,
    homeExternalTeamId: partial.homeExternalTeamId ?? null,
    awayExternalTeamId: partial.awayExternalTeamId ?? null,
    homeScore: partial.homeScore ?? null,
    awayScore: partial.awayScore ?? null,
    status: partial.status,
    phase: partial.phase ?? "group",
  };
}

function legacyComposition(
  groups: Array<{ id: string }>,
  memberIdsByGroupId: Record<string, string[]>,
  matches: KnockoutPreviewMatch[],
  options: KnockoutOptions,
) {
  const progress = isGroupStageComplete(groups, memberIdsByGroupId, matches);
  const standingsByGroupId = Object.fromEntries(
    groups.map((group) => [
      group.id,
      computeGroupStandings(
        memberIdsByGroupId[group.id] ?? [],
        matches.filter((item) => item.groupId === group.id && item.phase !== "knockout"),
      ),
    ]),
  );
  const qualifiers = qualifyTopTwo(groups, standingsByGroupId);
  const plan = buildKnockoutPlan(options, qualifiers);
  return { progress, standingsByGroupId, qualifiers, plan };
}

function assertEquivalence(
  label: string,
  groups: Array<{ id: string }>,
  memberIdsByGroupId: Record<string, string[]>,
  matches: KnockoutPreviewMatch[],
  options: KnockoutOptions,
) {
  const preview = buildKnockoutQualificationPreview({
    groups,
    memberIdsByGroupId,
    matches,
    options,
  });
  const legacy = legacyComposition(groups, memberIdsByGroupId, matches, options);

  assert(
    preview.progress.complete === legacy.progress.complete &&
      preview.progress.expected === legacy.progress.expected &&
      preview.progress.completed === legacy.progress.completed,
    `${label}: progress equivalence`,
  );
  assert(
    JSON.stringify(preview.standingsByGroupId) === JSON.stringify(legacy.standingsByGroupId),
    `${label}: standings equivalence`,
  );
  assert(
    JSON.stringify(preview.qualifiers) === JSON.stringify(legacy.qualifiers),
    `${label}: qualifier equivalence`,
  );
  assert(JSON.stringify(preview.plan) === JSON.stringify(legacy.plan), `${label}: plan equivalence`);
  assert(
    JSON.stringify(preview.firstRoundMatches) ===
      JSON.stringify(legacy.plan.matches.filter((item) => item.homeId != null && item.awayId != null)),
    `${label}: first-round projection equivalence`,
  );
}

function completedFourTeamFixture() {
  const groups = [{ id: "gA" }, { id: "gB" }];
  const memberIdsByGroupId = {
    gA: ["A1", "A2", "A3"],
    gB: ["B1", "B2", "B3"],
  };
  const matches: KnockoutPreviewMatch[] = [
    match({
      groupId: "gA",
      homeApplicationId: "A1",
      awayApplicationId: "A2",
      homeScore: 2,
      awayScore: 0,
      status: "completed",
    }),
    match({
      groupId: "gA",
      homeApplicationId: "A1",
      awayApplicationId: "A3",
      homeScore: 1,
      awayScore: 0,
      status: "completed",
    }),
    match({
      groupId: "gA",
      homeApplicationId: "A2",
      awayApplicationId: "A3",
      homeScore: 3,
      awayScore: 1,
      status: "completed",
    }),
    match({
      groupId: "gB",
      homeApplicationId: "B1",
      awayApplicationId: "B2",
      homeScore: 0,
      awayScore: 0,
      status: "completed",
    }),
    match({
      groupId: "gB",
      homeApplicationId: "B1",
      awayApplicationId: "B3",
      homeScore: 2,
      awayScore: 1,
      status: "completed",
    }),
    match({
      groupId: "gB",
      homeApplicationId: "B2",
      awayApplicationId: "B3",
      homeScore: 1,
      awayScore: 0,
      status: "completed",
    }),
  ];
  const options: KnockoutOptions = {
    format: 4,
    includeThirdPlace: true,
    includePlacement5: false,
    includePlacement7: false,
  };
  return { groups, memberIdsByGroupId, matches, options };
}

/**
 * Pure + structural checks for C6-G D1 shared KO qualification preview.
 */
export function runKnockoutPreviewChecks() {
  const helper = read("src/lib/schedule/knockout-preview.ts");
  const actions = read("src/lib/db/knockout-actions.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const knockoutBoard = read("src/components/admin/TournamentKnockoutBoard.tsx");
  const lockHelper = read("src/lib/schedule/group-result-lock.ts");
  const lockUx = read("src/lib/schedule/group-result-lock-ux.ts");

  assert(
    helper.includes("export function buildKnockoutQualificationPreview") &&
      helper.includes("computeGroupStandings") &&
      helper.includes("qualifyTopTwo") &&
      helper.includes("buildKnockoutPlan") &&
      helper.includes("isGroupStageComplete"),
    "shared helper reuses existing standings/qualify/plan/completeness helpers",
  );
  assert(
    !helper.includes("createClient") &&
      !helper.includes("supabase") &&
      !helper.includes("requireResultsManage") &&
      !helper.includes("revalidatePath") &&
      !helper.includes("useState") &&
      !helper.includes("from \"react\""),
    "shared helper is pure (no DB/auth/React/revalidation)",
  );

  assert(
    actions.includes("buildKnockoutQualificationPreview") &&
      actions.includes('from "@/lib/schedule/knockout-preview"') &&
      actions.includes("forceIncomplete"),
    "generateKnockoutAction consumes shared helper and retains forceIncomplete",
  );

  // No duplicate inlined pipeline inside generateKnockoutAction body.
  const generateStart = actions.indexOf("export async function generateKnockoutAction");
  const nextExport = actions.indexOf("\nexport async function", generateStart + 1);
  const generateBody = actions.slice(generateStart, nextExport === -1 ? undefined : nextExport);
  assert(
    generateBody.includes("buildKnockoutQualificationPreview") &&
      !generateBody.includes("computeGroupStandings") &&
      !generateBody.includes("qualifyTopTwo") &&
      !generateBody.includes("buildKnockoutPlan(") &&
      !generateBody.includes("isGroupStageComplete("),
    "generateKnockoutAction does not retain duplicate standings→qualify→plan pipeline",
  );

  assert(
    !knockoutBoard.includes("buildKnockoutQualificationPreview") &&
      !knockoutBoard.includes("knockout-preview"),
    "D1 does not add preview UX to TournamentKnockoutBoard",
  );

  assert(
    lockHelper.includes("GROUP_RESULT_LOCKED_BY_KNOCKOUT") &&
      lockUx.includes("GROUP_RESULT_LOCK_CORRECTION_MESSAGE"),
    "C6-F lock helper/UX copy remain present",
  );
  assert(
    actions.includes("export async function deleteTournamentKnockoutAction") &&
      !generateBody.includes("deleteTournamentKnockoutAction"),
    "deleteTournamentKnockoutAction remains a separate action (not folded into generate planning)",
  );

  // 1) Completed groups — equivalence + first-round seeds
  const completed = completedFourTeamFixture();
  assertEquivalence(
    "completed groups",
    completed.groups,
    completed.memberIdsByGroupId,
    completed.matches,
    completed.options,
  );
  const completedPreview = buildKnockoutQualificationPreview(completed);
  assert(completedPreview.progress.complete, "completed groups: progress complete");
  assert(completedPreview.plan.error == null, "completed groups: plan ok");
  assert(completedPreview.firstRoundMatches.length === 2, "completed groups: two first-round matches");
  assert(
    completedPreview.firstRoundMatches[0]?.homeId === "A1" &&
      completedPreview.firstRoundMatches[0]?.awayId === "B2" &&
      completedPreview.firstRoundMatches[1]?.homeId === "B1" &&
      completedPreview.firstRoundMatches[1]?.awayId === "A2",
    "completed groups: first-round A1vsB2 / B1vsA2",
  );
  assert(
    completedPreview.qualifiers.map((team) => team.seedLabel).join(",") === "A1,A2,B1,B2",
    "completed groups: seed labels",
  );

  // 2) Incomplete groups — planning still runs (force-compatible); completeness false
  const incompleteMatches = completed.matches.slice(0, 2);
  assertEquivalence(
    "incomplete groups",
    completed.groups,
    completed.memberIdsByGroupId,
    incompleteMatches,
    completed.options,
  );
  const incompletePreview = buildKnockoutQualificationPreview({
    ...completed,
    matches: incompleteMatches,
  });
  assert(!incompletePreview.progress.complete, "incomplete groups: not complete");
  // Force-incomplete-compatible: helper still returns standings/qualifiers/plan for same inputs
  assert(
    incompletePreview.qualifiers.length >= 0 && incompletePreview.plan != null,
    "incomplete groups: force-compatible planning still produced",
  );

  // 3) 0-0 completed already in fixture group B — verify draw points via standings
  const bStandings = completedPreview.standingsByGroupId.gB as StandingRow[];
  const b1 = bStandings.find((row) => row.applicationId === "B1");
  const b2 = bStandings.find((row) => row.applicationId === "B2");
  assert(b1 != null && b2 != null, "0-0 fixture teams present");
  assert(b1.drawn >= 1 || b2.drawn >= 1, "0-0 completed counts as draw");

  // 4) Partial score ignored by standings (no other A3 matches)
  const withPartial = [
    match({
      groupId: "gA",
      homeApplicationId: "A1",
      awayApplicationId: "A2",
      homeScore: 1,
      awayScore: 0,
      status: "completed",
    }),
    match({
      groupId: "gA",
      homeApplicationId: "A2",
      awayApplicationId: "A3",
      homeScore: 2,
      awayScore: null,
      status: "live",
    }),
  ];
  assertEquivalence(
    "partial score",
    completed.groups,
    completed.memberIdsByGroupId,
    withPartial,
    completed.options,
  );
  const partialPreview = buildKnockoutQualificationPreview({
    ...completed,
    matches: withPartial,
  });
  const a3Partial = partialPreview.standingsByGroupId.gA.find((row) => row.applicationId === "A3");
  assert(a3Partial?.played === 0, "partial score: A3 remains unplayed from partial match");

  // 5) Cancelled match ignored (no other A3 matches)
  const withCancelled = [
    match({
      groupId: "gA",
      homeApplicationId: "A1",
      awayApplicationId: "A2",
      homeScore: 1,
      awayScore: 0,
      status: "completed",
    }),
    match({
      groupId: "gA",
      homeApplicationId: "A2",
      awayApplicationId: "A3",
      homeScore: 5,
      awayScore: 0,
      status: "cancelled",
    }),
  ];
  assertEquivalence(
    "cancelled match",
    completed.groups,
    completed.memberIdsByGroupId,
    withCancelled,
    completed.options,
  );
  const cancelledPreview = buildKnockoutQualificationPreview({
    ...completed,
    matches: withCancelled,
  });
  const a3Cancelled = cancelledPreview.standingsByGroupId.gA.find((row) => row.applicationId === "A3");
  assert(a3Cancelled?.played === 0, "cancelled match ignored by standings");

  // 6) Deterministic tie — equal empty standings → localeCompare applicationId
  const tieGroups = [{ id: "g1" }, { id: "g2" }];
  const tieMembers = { g1: ["zebra", "alpha"], g2: ["beta", "gamma"] };
  const tieMatches: KnockoutPreviewMatch[] = [];
  const tieOptions: KnockoutOptions = {
    format: 4,
    includeThirdPlace: false,
    includePlacement5: false,
    includePlacement7: false,
  };
  assertEquivalence("deterministic tie", tieGroups, tieMembers, tieMatches, tieOptions);
  const tiePreview = buildKnockoutQualificationPreview({
    groups: tieGroups,
    memberIdsByGroupId: tieMembers,
    matches: tieMatches,
    options: tieOptions,
  });
  assert(
    tiePreview.qualifiers.find((team) => team.seedLabel === "A1")?.applicationId === "alpha" &&
      tiePreview.qualifiers.find((team) => team.seedLabel === "A2")?.applicationId === "zebra",
    "deterministic tie: alpha before zebra by applicationId",
  );

  // 7) Qualifier IDs/ranks/seed labels (completed fixture)
  assert(
    completedPreview.qualifiers.every((team) => team.rank === 1 || team.rank === 2) &&
      completedPreview.qualifiers[0]?.applicationId === "A1",
    "qualifier IDs/ranks present",
  );

  // 8) First-round pairing equivalence covered by assertEquivalence + completed assert above

  // 9) Force-incomplete-compatible planning: incomplete still builds plan when enough ranked teams
  // With empty matches, 2 groups × top2 still yields 4 teams → plan can succeed
  assert(tiePreview.plan.error == null, "force-incomplete path can still plan from ranked empty tables");
  assert(!tiePreview.progress.complete, "empty matches remain incomplete (force gate still needed)");

  // 10) Invalid/insufficient qualification — one group only for format 4
  const insufficient = buildKnockoutQualificationPreview({
    groups: [{ id: "gA" }],
    memberIdsByGroupId: { gA: ["A1", "A2"] },
    matches: [],
    options: completed.options,
  });
  assert(insufficient.plan.error != null, "insufficient groups/teams: plan error");
  assert(insufficient.firstRoundMatches.length === 0, "insufficient: no first-round matches");

  // 11) Unsupported group configuration for format 8 (only 2 groups)
  const wrongFormat = buildKnockoutQualificationPreview({
    groups: completed.groups,
    memberIdsByGroupId: completed.memberIdsByGroupId,
    matches: completed.matches,
    options: {
      format: 8,
      includeThirdPlace: true,
      includePlacement5: true,
      includePlacement7: false,
    },
  });
  assert(wrongFormat.plan.error != null, "format 8 with 2 groups: planner rejects");

  // 12) KO rows ignored for standings composition
  const withKo = [
    ...completed.matches,
    match({
      groupId: null,
      homeApplicationId: "A1",
      awayApplicationId: "B2",
      homeScore: 9,
      awayScore: 0,
      status: "completed",
      phase: "knockout",
    }),
  ];
  assertEquivalence(
    "ignore knockout rows",
    completed.groups,
    completed.memberIdsByGroupId,
    withKo,
    completed.options,
  );

  assert(
    runChecksCli.includes("runKnockoutPreviewChecks") &&
      runChecksCli.includes("knockout-preview-checks"),
    "knockout-preview-checks wired into run-checks-cli",
  );

  return "ok";
}
