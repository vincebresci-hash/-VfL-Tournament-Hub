import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canRegenerateGroupSchedule } from "@/lib/schedule/plan-preview";
import { isGroupStageComplete } from "@/lib/schedule/knockout";
import {
  canTransitionTournamentLifecycle,
  lifecycleAllowsDestructiveGroupScheduleMutation,
  lifecycleGroupResultMutationPolicy,
  resolveEffectiveTournamentLifecycle,
  TOURNAMENT_LIFECYCLE_STATES,
  type TournamentLifecycleFacts,
  type TournamentLifecycleState,
} from "@/lib/schedule/tournament-lifecycle";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-lifecycle-checks: ${message}`);
  }
}

function facts(partial: Partial<TournamentLifecycleFacts>): TournamentLifecycleFacts {
  return {
    marketingStatusCompleted: false,
    groupsExist: false,
    groupScheduleExists: false,
    groupStageComplete: false,
    knockoutExists: false,
    completionEligible: false,
    ...partial,
  };
}

function effective(
  intended: TournamentLifecycleState | null | undefined,
  partial: Partial<TournamentLifecycleFacts>,
) {
  return resolveEffectiveTournamentLifecycle({ intended, facts: facts(partial) });
}

/**
 * Pure + structural checks for C6-H D1 tournament lifecycle model.
 * Not DB / browser E2E.
 */
export function runTournamentLifecycleChecks() {
  // --- States ---
  assert(
    TOURNAMENT_LIFECYCLE_STATES.join(",") ===
      "setup,group_stage,knockout_stage,completed",
    "lifecycle states locked",
  );

  // --- Effective resolver ---
  assert(effective(null, {}) === "setup", "setup/no groups");
  assert(effective("setup", {}) === "setup", "intended setup/no groups");
  assert(
    effective("setup", { groupsExist: true }) === "group_stage",
    "setup/groups exist → group_stage",
  );
  assert(
    effective(null, { groupsExist: true, groupStageComplete: false }) === "group_stage",
    "group stage incomplete",
  );
  assert(
    effective(null, { groupsExist: true, groupStageComplete: true }) === "group_stage",
    "group stage complete still group_stage without KO",
  );
  assert(
    effective(null, { groupsExist: true, knockoutExists: true }) === "knockout_stage",
    "KO presence → knockout_stage",
  );
  assert(
    effective("group_stage", {
      groupsExist: true,
      knockoutExists: true,
    }) === "knockout_stage",
    "KO presence overrides intended group_stage",
  );
  assert(
    effective("setup", { knockoutExists: true }) === "knockout_stage",
    "KO presence cannot resolve to setup",
  );
  assert(
    effective("knockout_stage", {
      groupsExist: true,
      knockoutExists: true,
    }) === "knockout_stage",
    "intended knockout with KO present",
  );
  // Cancelled KO still counts as presence (status ignored at fact layer).
  assert(
    effective("group_stage", {
      groupsExist: true,
      knockoutExists: true,
    }) === "knockout_stage",
    "cancelled KO presence still knockout_stage when fact true",
  );
  assert(
    effective("knockout_stage", {
      groupsExist: true,
      knockoutExists: false,
    }) === "group_stage",
    "intended knockout with KO missing → rewind group_stage",
  );
  assert(
    effective("knockout_stage", {
      groupsExist: false,
      knockoutExists: false,
    }) === "setup",
    "intended knockout, no KO, no groups → setup",
  );
  assert(
    effective(null, { marketingStatusCompleted: true }) === "completed",
    "completed marketing status",
  );
  assert(
    effective("group_stage", {
      groupsExist: true,
      marketingStatusCompleted: true,
    }) === "completed",
    "marketing completed wins over groups",
  );
  assert(
    effective("knockout_stage", {
      knockoutExists: true,
      marketingStatusCompleted: true,
    }) === "completed",
    "marketing completed wins over KO",
  );
  assert(effective("completed", {}) === "completed", "intended completed lifecycle");
  assert(
    effective("completed", {
      groupsExist: true,
      knockoutExists: true,
    }) === "completed",
    "intended completed wins over KO/groups",
  );

  // Determinism
  const snap = facts({ groupsExist: true, knockoutExists: true });
  assert(
    resolveEffectiveTournamentLifecycle({ intended: "group_stage", facts: snap }) ===
      resolveEffectiveTournamentLifecycle({ intended: "group_stage", facts: snap }),
    "determinism",
  );

  // --- Transitions ---
  assert(
    !canTransitionTournamentLifecycle({
      from: "setup",
      to: "group_stage",
      facts: facts({}),
    }).allowed,
    "setup→group without groups blocked",
  );
  assert(
    canTransitionTournamentLifecycle({
      from: "setup",
      to: "group_stage",
      facts: facts({ groupsExist: true }),
    }).allowed,
    "setup→group with groups allowed",
  );

  const groupToKoNoKo = canTransitionTournamentLifecycle({
    from: "group_stage",
    to: "knockout_stage",
    facts: facts({ groupsExist: true, groupStageComplete: true }),
  });
  assert(!groupToKoNoKo.allowed, "group→KO without KO blocked");
  assert(groupToKoNoKo.code === "GROUP_TO_KO_BLOCKED_NO_KO", "group→KO without KO code");

  const groupToKoWithKo = canTransitionTournamentLifecycle({
    from: "group_stage",
    to: "knockout_stage",
    facts: facts({ groupsExist: true, knockoutExists: true }),
  });
  assert(groupToKoWithKo.allowed, "group→KO with KO allowed");
  assert(groupToKoWithKo.code === "GROUP_TO_KO_ALLOWED", "group→KO with KO code");

  const koToGroupWhileKo = canTransitionTournamentLifecycle({
    from: "knockout_stage",
    to: "group_stage",
    facts: facts({ groupsExist: true, knockoutExists: true }),
  });
  assert(!koToGroupWhileKo.allowed, "KO→group while KO exists blocked");

  const koToGroupAfterRemoval = canTransitionTournamentLifecycle({
    from: "knockout_stage",
    to: "group_stage",
    facts: facts({ groupsExist: true, knockoutExists: false }),
  });
  assert(koToGroupAfterRemoval.allowed, "KO→group after KO removal allowed");
  assert(koToGroupAfterRemoval.code === "KO_TO_GROUP_ALLOWED", "KO→group code");

  const koToCompletedBlocked = canTransitionTournamentLifecycle({
    from: "knockout_stage",
    to: "completed",
    facts: facts({ knockoutExists: true, completionEligible: false }),
  });
  assert(!koToCompletedBlocked.allowed, "KO→completed without eligibility blocked");

  const koToCompletedAllowed = canTransitionTournamentLifecycle({
    from: "knockout_stage",
    to: "completed",
    facts: facts({ knockoutExists: true, completionEligible: true }),
  });
  assert(koToCompletedAllowed.allowed, "KO→completed with eligibility allowed");

  const reopenKoNoConfirm = canTransitionTournamentLifecycle({
    from: "completed",
    to: "knockout_stage",
    facts: facts({ knockoutExists: true }),
  });
  assert(!reopenKoNoConfirm.allowed, "completed→KO without confirmation blocked");
  assert(reopenKoNoConfirm.requiresConfirmation, "completed→KO requires confirmation");

  const reopenKoConfirm = canTransitionTournamentLifecycle({
    from: "completed",
    to: "knockout_stage",
    facts: facts({ knockoutExists: true }),
    confirmReopen: true,
  });
  assert(reopenKoConfirm.allowed, "completed→KO with confirmation allowed");
  assert(reopenKoConfirm.requiresConfirmation, "completed→KO confirmation flag");

  const reopenGroupNoConfirm = canTransitionTournamentLifecycle({
    from: "completed",
    to: "group_stage",
    facts: facts({ groupsExist: true, knockoutExists: false }),
  });
  assert(!reopenGroupNoConfirm.allowed, "completed→group without confirmation blocked");
  assert(reopenGroupNoConfirm.requiresConfirmation, "completed→group requires confirmation");

  const reopenGroupConfirm = canTransitionTournamentLifecycle({
    from: "completed",
    to: "group_stage",
    facts: facts({ groupsExist: true, knockoutExists: false }),
    confirmReopen: true,
  });
  assert(reopenGroupConfirm.allowed, "completed→group with confirmation allowed");

  assert(
    !canTransitionTournamentLifecycle({
      from: "setup",
      to: "knockout_stage",
      facts: facts({ knockoutExists: true }),
    }).allowed,
    "invalid setup→KO rejected",
  );
  assert(
    !canTransitionTournamentLifecycle({
      from: "setup",
      to: "completed",
      facts: facts({ completionEligible: true }),
    }).allowed,
    "invalid setup→completed rejected",
  );
  assert(
    !canTransitionTournamentLifecycle({
      from: "group_stage",
      to: "completed",
      facts: facts({ groupsExist: true, completionEligible: true }),
    }).allowed,
    "invalid group→completed rejected",
  );

  const same = canTransitionTournamentLifecycle({
    from: "group_stage",
    to: "group_stage",
    facts: facts({ groupsExist: true }),
  });
  assert(same.allowed && same.code === "SAME_STATE", "same-state allowed no-op");

  // Browser intent alone insufficient: completeness without KO cannot advance.
  assert(
    !canTransitionTournamentLifecycle({
      from: "group_stage",
      to: "knockout_stage",
      facts: facts({
        groupsExist: true,
        groupStageComplete: true,
        groupScheduleExists: true,
        knockoutExists: false,
      }),
    }).allowed,
    "browser intent / completeness alone insufficient for KO advance",
  );

  // --- C6-F composition: lifecycle never unlocks group results when KO exists ---
  const locked = lifecycleGroupResultMutationPolicy({ knockoutExists: true });
  assert(!locked.allowed, "KO presence cannot unlock group-result mutation");
  const unlocked = lifecycleGroupResultMutationPolicy({ knockoutExists: false });
  assert(unlocked.allowed, "no KO → group results mutable via C6-F helper");

  // --- Completeness: consume existing helper, no second algorithm ---
  const completeness = isGroupStageComplete(
    [{ id: "g1" }],
    { g1: ["a", "b"] },
    [{ groupId: "g1", status: "completed", phase: "group" }],
  );
  assert(
    typeof completeness.complete === "boolean",
    "consumes existing isGroupStageComplete result shape",
  );
  assert(
    effective(null, {
      groupsExist: true,
      groupStageComplete: completeness.complete,
    }) === "group_stage",
    "lifecycle uses completeness as fact only",
  );

  // --- C6-B defense in depth ---
  const c6bBlocked = canRegenerateGroupSchedule({
    tournamentStatus: "active",
    groupCount: 2,
    matches: [{ phase: "knockout", status: "scheduled" }],
  });
  assert(c6bBlocked.decision === "blocked", "fixture: C6-B blocks on KO");
  assert(
    !lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "setup",
      regenerationPolicy: c6bBlocked,
    }),
    "lifecycle cannot authorize C6-B-blocked destructive mutation",
  );

  const c6bAllowed = canRegenerateGroupSchedule({
    tournamentStatus: "active",
    groupCount: 2,
    matches: [],
  });
  assert(c6bAllowed.decision === "allowed", "fixture: C6-B allowed groups-only");
  assert(
    lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "group_stage",
      regenerationPolicy: c6bAllowed,
    }),
    "group_stage + C6-B allowed → destructive ok",
  );
  assert(
    !lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "knockout_stage",
      regenerationPolicy: c6bAllowed,
    }),
    "lifecycle knockout_stage tightens beyond C6-B allowed",
  );
  assert(
    !lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "completed",
      regenerationPolicy: c6bAllowed,
    }),
    "lifecycle completed tightens beyond C6-B allowed",
  );

  const c6bCompleted = canRegenerateGroupSchedule({
    tournamentStatus: "completed",
    groupCount: 0,
    matches: [],
  });
  assert(c6bCompleted.decision === "blocked", "fixture: marketing completed blocks");
  assert(
    !lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "setup",
      regenerationPolicy: c6bCompleted,
    }),
    "marketing/C6-B completed cannot be overridden by lifecycle setup",
  );

  // --- Structural purity / freeze ---
  const lifecycle = read("src/lib/schedule/tournament-lifecycle.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const planPreview = read("src/lib/schedule/plan-preview.ts");
  const groupLock = read("src/lib/schedule/group-result-lock.ts");
  const knockoutPreview = read("src/lib/schedule/knockout-preview.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const knockoutBoard = read("src/components/admin/TournamentKnockoutBoard.tsx");

  assert(
    lifecycle.includes("export function resolveEffectiveTournamentLifecycle") &&
      lifecycle.includes("export function canTransitionTournamentLifecycle") &&
      lifecycle.includes("export function lifecycleAllowsDestructiveGroupScheduleMutation"),
    "lifecycle exports required helpers",
  );
  assert(
    !lifecycle.includes("use server") &&
      !lifecycle.includes("createClient") &&
      !lifecycle.includes("supabase") &&
      !lifecycle.includes("revalidatePath") &&
      !lifecycle.includes("from \"react\"") &&
      !lifecycle.includes("requireResultsManage") &&
      !lifecycle.includes("requireScheduleManage"),
    "lifecycle module remains pure",
  );
  assert(
    !lifecycle.includes("computeGroupStandings") &&
      !lifecycle.includes("qualifyTopTwo") &&
      !lifecycle.includes("buildKnockoutPlan") &&
      !lifecycle.includes("buildKnockoutQualificationPreview") &&
      !lifecycle.includes("isKnockoutPhaseComplete") &&
      !lifecycle.includes("function isGroupStageComplete"),
    "no second standings/qualification/KO-completion/completeness algorithm",
  );
  assert(
    lifecycle.includes("export function isTournamentCompletionEligible") &&
      lifecycle.includes("resolveKnockoutOutcome"),
    "completion eligibility reuses resolveKnockoutOutcome (no second algorithm)",
  );
  assert(
    lifecycle.includes('from "@/lib/schedule/group-result-lock"') &&
      lifecycle.includes("canMutateGroupResults"),
    "composes C6-F for group-result lock",
  );
  assert(
    lifecycle.includes('from "@/lib/schedule/plan-preview"') &&
      lifecycle.includes("RegenerationPolicyResult"),
    "references C6-B policy type for defense-in-depth composition",
  );

  // Production freeze: D1 must not alter C6-B/C6-F/C6-G production modules.
  assert(
    planPreview.includes("export function canRegenerateGroupSchedule"),
    "C6-B helper still present",
  );
  assert(
    groupLock.includes("export function canMutateGroupResults") &&
      groupLock.includes('phase === "knockout"'),
    "C6-F helper still present",
  );
  assert(
    knockoutPreview.includes("export function buildKnockoutQualificationPreview") &&
      knockoutActions.includes("export async function generateKnockoutAction") &&
      knockoutBoard.includes("buildKnockoutQualificationPreview"),
    "C6-G production surface still present",
  );

  assert(
    runChecksCli.includes("runTournamentLifecycleChecks") &&
      runChecksCli.includes("tournament-lifecycle-checks"),
    "lifecycle checks wired into run-checks-cli",
  );

  return "ok";
}
