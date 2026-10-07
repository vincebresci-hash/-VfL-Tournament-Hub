import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  canRegenerateGroupSchedule,
} from "@/lib/schedule/plan-preview";
import {
  isTournamentCompletionEligible,
  lifecycleAllowsDestructiveGroupScheduleMutation,
  resolveEffectiveTournamentLifecycle,
} from "@/lib/schedule/tournament-lifecycle";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-lifecycle-persist-checks: ${message}`);
  }
}

function findLifecycleMigration(): { name: string; source: string } {
  const dir = join(process.cwd(), "supabase/migrations");
  const names = readdirSync(dir).filter((name) => name.includes("lifecycle"));
  assert(names.length === 1, `expected exactly one lifecycle migration, found ${names.join(",")}`);
  const name = names[0]!;
  return { name, source: read(`supabase/migrations/${name}`) };
}

/**
 * Structural + pure checks for C6-H D2 lifecycle persistence / server guards.
 * Not DB integration / E2E.
 */
export function runTournamentLifecyclePersistChecks() {
  const migration = findLifecycleMigration();
  const mig = migration.source;

  assert(mig.includes("lifecycle_state"), "migration adds lifecycle_state");
  assert(mig.includes("NOT NULL"), "migration NOT NULL");
  assert(mig.includes("DEFAULT 'setup'") || mig.includes('DEFAULT "setup"'), "DEFAULT setup");
  assert(mig.includes("'setup'"), "check includes setup");
  assert(mig.includes("'group_stage'"), "check includes group_stage");
  assert(mig.includes("'knockout_stage'"), "check includes knockout_stage");
  assert(mig.includes("'completed'"), "check includes completed");
  assert(mig.includes("tournaments_lifecycle_state_check") || mig.includes("CHECK"), "CHECK present");

  // Backfill precedence: completed before KO before groups
  const completedIdx = mig.indexOf("SET lifecycle_state = 'completed'");
  const koIdx = mig.indexOf("SET lifecycle_state = 'knockout_stage'");
  const groupIdx = mig.indexOf("SET lifecycle_state = 'group_stage'");
  assert(completedIdx >= 0 && koIdx > completedIdx && groupIdx > koIdx, "backfill precedence ordering");
  assert(mig.includes("status = 'completed'"), "completed backfill from marketing status");
  assert(
    mig.includes("phase = 'knockout'") && !mig.includes("status = 'completed' AND m.phase"),
    "KO backfill phase-only",
  );
  // KO backfill must not filter match status
  const koBlock = mig.slice(koIdx, groupIdx);
  assert(
    !koBlock.includes("m.status") && !koBlock.includes("match.status"),
    "KO backfill status-agnostic",
  );
  assert(mig.includes("tournament_groups"), "group backfill");

  // Types
  const database = read("src/lib/supabase/database.ts");
  assert(
    database.includes("lifecycle_state") &&
      database.includes("TournamentLifecycleStateRow"),
    "database types include lifecycle_state",
  );
  assert(
    !database.includes('type TournamentLifecycleState ='),
    "no competing lifecycle union in database.ts (use D1 / Row alias)",
  );

  // Snapshot helper
  const helper = read("src/lib/db/tournament-lifecycle.ts");
  assert(
    helper.includes("export async function loadTournamentLifecycleSnapshot") &&
      helper.includes("resolveEffectiveTournamentLifecycle") &&
      helper.includes("mismatch"),
    "shared snapshot reuses D1 resolver",
  );
  assert(
    helper.includes("persisted") && helper.includes("effective") && helper.includes("facts"),
    "snapshot exposes persisted/effective/facts",
  );
  assert(
    !helper.includes("setTournamentLifecycleAction") &&
      !helper.includes("export async function setTournamentLifecycle"),
    "no generic lifecycle setter",
  );
  assert(
    !helper.includes("computeGroupStandings") &&
      !helper.includes("qualifyTopTwo") &&
      !helper.includes("buildKnockoutPlan") &&
      !helper.includes("buildKnockoutQualificationPreview"),
    "no C6-G duplication in lifecycle helper",
  );
  assert(
    helper.includes("isTournamentCompletionEligible"),
    "db helper reuses shared completion eligibility",
  );
  const pureLifecycle = read("src/lib/schedule/tournament-lifecycle.ts");
  assert(
    pureLifecycle.includes("export function isTournamentCompletionEligible") &&
      pureLifecycle.includes("resolveKnockoutOutcome"),
    "completion eligibility is pure and reuses resolveKnockoutOutcome",
  );
  assert(
    helper.includes("syncLifecycleAfterKnockoutPersisted") &&
      helper.includes("syncLifecycleAfterKnockoutRemoved") &&
      helper.includes("syncLifecycleAfterGroupsChanged") &&
      helper.includes("planReopenTournamentLifecycle"),
    "persist sync helpers present",
  );

  // Pure completion eligibility (no second algorithm)
  assert(
    !isTournamentCompletionEligible([]),
    "no matches → not completion eligible",
  );
  assert(
    !isTournamentCompletionEligible([
      {
        phase: "knockout",
        round: "final",
        status: "scheduled",
        homeApplicationId: "a",
        awayApplicationId: "b",
        homeScore: null,
        awayScore: null,
      },
    ]),
    "unfinished final → not eligible",
  );
  assert(
    isTournamentCompletionEligible([
      {
        phase: "knockout",
        round: "final",
        status: "completed",
        homeApplicationId: "a",
        awayApplicationId: "b",
        homeScore: 2,
        awayScore: 1,
        decidedBy: "regular",
      },
    ]),
    "final with winner → eligible",
  );

  // Effective resolver still dominates persisted intent (D1 reuse)
  assert(
    resolveEffectiveTournamentLifecycle({
      intended: "knockout_stage",
      facts: {
        marketingStatusCompleted: false,
        groupsExist: true,
        groupScheduleExists: true,
        groupStageComplete: true,
        knockoutExists: false,
        completionEligible: false,
      },
    }) === "group_stage",
    "stale knockout intent rewinds without KO",
  );

  // Groups / KO / complete / reopen wiring
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const knockoutActions = read("src/lib/db/knockout-actions.ts");
  const persistCore = read("src/lib/db/plan-schedule-persist.ts");
  const adminActions = read("src/lib/db/admin-actions.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");
  const groupLock = read("src/lib/schedule/group-result-lock.ts");
  const knockoutPreview = read("src/lib/schedule/knockout-preview.ts");

  assert(
    scheduleActions.includes("syncLifecycleAfterGroupsChanged") &&
      scheduleActions.includes("createTournamentGroupAction") &&
      scheduleActions.includes("autoDistributeTeamsAction") &&
      scheduleActions.includes("deleteTournamentGroupAction"),
    "group create/distribute/delete sync lifecycle",
  );

  // KO generate: sync after links
  const generateStart = knockoutActions.indexOf("export async function generateKnockoutAction");
  const generateEnd = knockoutActions.indexOf(
    "\nexport async function",
    generateStart + 10,
  );
  const generateBody = knockoutActions.slice(
    generateStart,
    generateEnd === -1 ? undefined : generateEnd,
  );
  assert(
    generateBody.includes("syncLifecycleAfterKnockoutPersisted") &&
      generateBody.indexOf("syncLifecycleAfterKnockoutPersisted") >
        generateBody.lastIndexOf("loser_next_match_slot"),
    "KO lifecycle promotion after link persistence",
  );
  assert(
    generateBody.includes("buildKnockoutQualificationPreview"),
    "C6-G preview retained in generate",
  );

  // KO delete: delete before rewind
  const deleteStart = knockoutActions.indexOf(
    "export async function deleteTournamentKnockoutAction",
  );
  const deleteEnd = knockoutActions.indexOf("\nexport async function", deleteStart + 10);
  const deleteBody = knockoutActions.slice(
    deleteStart,
    deleteEnd === -1 ? undefined : deleteEnd,
  );
  assert(
    deleteBody.includes('.eq("phase", "knockout")') &&
      deleteBody.includes("syncLifecycleAfterKnockoutRemoved") &&
      deleteBody.indexOf('.eq("phase", "knockout")') <
        deleteBody.indexOf("syncLifecycleAfterKnockoutRemoved"),
    "KO delete before lifecycle rewind",
  );

  // Completion dual-write
  const completeStart = knockoutActions.indexOf(
    "export async function completeTournamentAction",
  );
  const completeEnd = knockoutActions.indexOf("\nexport async function", completeStart + 10);
  const completeBody = knockoutActions.slice(
    completeStart,
    completeEnd === -1 ? undefined : completeEnd,
  );
  assert(
    completeBody.includes("isTournamentCompletionEligible") &&
      completeBody.includes('status: "completed"') &&
      completeBody.includes('lifecycle_state: "completed"'),
    "completion dual-writes status + lifecycle_state",
  );
  assert(
    !completeBody.includes("placement-5") && !completeBody.includes("third-place"),
    "no placement completion requirement in complete action",
  );

  // Reopen
  assert(
    knockoutActions.includes("export async function reopenTournamentAction") &&
      knockoutActions.includes("requireResultsManage") &&
      knockoutActions.includes("planReopenTournamentLifecycle") &&
      knockoutActions.includes('status: "active"'),
    "reopen action present with results.manage + active + destination",
  );
  const reopenStart = knockoutActions.indexOf("export async function reopenTournamentAction");
  const reopenEnd = knockoutActions.indexOf("\nexport async function", reopenStart + 10);
  const reopenBody = knockoutActions.slice(
    reopenStart,
    reopenEnd === -1 ? undefined : reopenEnd,
  );
  assert(
    reopenBody.includes("confirm !== true") &&
      !reopenBody.includes("destination:") &&
      !reopenBody.includes("lifecycleState") &&
      !reopenBody.includes("applications_open"),
    "reopen requires confirm, no browser target, no applications_open mutation",
  );

  // Generic update completed guard
  const updateStart = adminActions.indexOf("export async function updateTournamentAction");
  const updateEnd = adminActions.indexOf("\nexport async function", updateStart + 10);
  const updateBody = adminActions.slice(updateStart, updateEnd === -1 ? undefined : updateEnd);
  assert(
    updateBody.includes("isTournamentCompletionEligible") &&
      updateBody.includes("lifecycle_state") &&
      updateBody.includes("Wiedereröffnung") &&
      updateBody.includes('previousStatus === "completed"'),
    "updateTournamentAction gates completed enter/demote",
  );

  // C6-B composition
  assert(
    persistCore.includes("lifecycleAllowsDestructiveGroupScheduleMutation") &&
      scheduleActions.includes("lifecycleAllowsDestructiveGroupScheduleMutation"),
    "C6-B paths wire lifecycle defense-in-depth",
  );
  const c6bBlocked = canRegenerateGroupSchedule({
    tournamentStatus: "active",
    groupCount: 1,
    matches: [{ phase: "knockout", status: "scheduled" }],
  });
  assert(c6bBlocked.decision === "blocked", "fixture C6-B blocked");
  assert(
    !lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "setup",
      regenerationPolicy: c6bBlocked,
    }),
    "lifecycle cannot weaken C6-B blocked",
  );
  const c6bConfirm = canRegenerateGroupSchedule({
    tournamentStatus: "active",
    groupCount: 1,
    matches: [{ phase: "group", status: "scheduled" }],
  });
  assert(c6bConfirm.decision === "allowedWithConfirmation", "fixture confirmation");
  assert(
    lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "group_stage",
      regenerationPolicy: c6bConfirm,
    }),
    "confirmation path remains allowed at lifecycle composition layer",
  );
  assert(
    persistCore.indexOf("lifecycleAllowsDestructiveGroupScheduleMutation") <
      persistCore.indexOf("allowedWithConfirmation") ||
      persistCore.includes("confirmation_required"),
    "lifecycle check does not remove confirmation gate",
  );
  const c6bAllowed = canRegenerateGroupSchedule({
    tournamentStatus: "active",
    groupCount: 1,
    matches: [],
  });
  assert(
    !lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle: "completed",
      regenerationPolicy: c6bAllowed,
    }),
    "lifecycle may tighten when completed",
  );

  // C6-F freeze
  assert(
    groupLock.includes('phase === "knockout"') &&
      groupLock.includes("canMutateGroupResults") &&
      scheduleActions.includes("tournamentHasKnockoutPhase") &&
      scheduleActions.includes("canMutateGroupResults"),
    "C6-F KO-presence lock remains authoritative",
  );

  // C6-G freeze
  assert(
    knockoutPreview.includes("export function buildKnockoutQualificationPreview"),
    "C6-G helper unchanged presence",
  );

  // No RPC / service role for lifecycle
  assert(
    !helper.includes("service_role") &&
      !mig.includes("service_role") &&
      !mig.includes("CREATE OR REPLACE FUNCTION"),
    "no lifecycle RPC/service-role",
  );

  // Runner
  assert(
    runChecksCli.includes("runTournamentLifecyclePersistChecks") &&
      runChecksCli.includes("tournament-lifecycle-persist-checks"),
    "persist checks wired once into run-checks-cli",
  );
  assert(
    runChecksCli.includes("runTournamentLifecycleChecks"),
    "D1 lifecycle suite retained",
  );

  return "ok";
}
