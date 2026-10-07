import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTICIPANT_EXIT_ORDER,
  PARTICIPANT_MATCH_GATE_MESSAGE,
  PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE,
  PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE,
  PARTICIPANT_NOT_FOUND_MESSAGE,
  canMutateParticipantMembership,
  canProceedParticipantExitAfterMembershipCleanup,
  exitTransitionIndex,
  membershipFirstIndex,
  participantGateFromStageFacts,
  resolveParticipantExitTransition,
} from "@/lib/tournament-participant-membership";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`tournament-participant-membership-checks: ${message}`);
  }
}

function sliceFn(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `missing ${startMarker}`);
  if (!endMarker) {
    return source.slice(start);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `missing end marker ${endMarker}`);
  return source.slice(start, end);
}

/**
 * Focused regression coverage for Aus Gruppe entfernen / Teilnehmer entfernen.
 * Pure + structural only — no live Supabase RLS integration tests.
 */
export function runTournamentParticipantMembershipChecks() {
  let passed = 0;

  // Pure exit-after-cleanup policy
  assert(
    canProceedParticipantExitAfterMembershipCleanup({
      error: null,
      verifiedAbsent: true,
    }),
    "3/4/5: no-membership / verified cleanup allows exit",
  );
  assert(
    !canProceedParticipantExitAfterMembershipCleanup({
      error: null,
      verifiedAbsent: false,
    }),
    "7/8: unverified cleanup blocks exit (false-success DELETE)",
  );
  assert(
    !canProceedParticipantExitAfterMembershipCleanup({
      error: PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE,
      verifiedAbsent: false,
    }),
    "7: cleanup error blocks exit",
  );
  passed += 1;

  // Match / completed gates
  assert(
    canMutateParticipantMembership({ matchCount: 0, tournamentStatus: "published" }).allowed,
    "GROUPS_ONLY / EMPTY allowed",
  );
  assert(
    !participantGateFromStageFacts({
      tournamentStatus: "published",
      matches: [{ phase: "group", status: "scheduled" }],
    }).allowed,
    "12: any match blocks",
  );
  assert(
    !canMutateParticipantMembership({ matchCount: 0, tournamentStatus: "completed" }).allowed,
    "13: completed blocks",
  );
  assert(
    participantGateFromStageFacts({
      tournamentStatus: "published",
      matches: [{ phase: "knockout", status: "cancelled" }],
    }).reason === PARTICIPANT_MATCH_GATE_MESSAGE,
    "12: KO/cancelled still match-gated",
  );
  passed += 1;

  // Exit semantics preserve rows
  const appExit = resolveParticipantExitTransition("application");
  const mtpExit = resolveParticipantExitTransition("mein-turnierplan");
  const manualExit = resolveParticipantExitTransition("manual");
  assert(
    appExit.from === "accepted" &&
      appExit.to === "rejected" &&
      appExit.preservesRow &&
      !appExit.deletesRow,
    "14: application accepted->rejected preserved",
  );
  assert(
    mtpExit.from === "confirmed" &&
      mtpExit.to === "rejected" &&
      mtpExit.preservesRow &&
      !mtpExit.deletesRow,
    "14: external confirmed->rejected preserved",
  );
  assert(
    manualExit.field === "external_active" &&
      manualExit.to === false &&
      manualExit.preservesRow &&
      !manualExit.deletesRow,
    "14: manual deactivate preserved",
  );
  assert(membershipFirstIndex() < exitTransitionIndex(), "membership-first order");
  assert(PARTICIPANT_EXIT_ORDER.includes("delete_group_membership"), "exit order");
  assert(PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE.length > 0, "missing membership message");
  assert(PARTICIPANT_NOT_FOUND_MESSAGE.includes("nicht gefunden"), "11: ownership message");
  passed += 1;

  const pure = read("src/lib/tournament-participant-membership.ts");
  const dbHelper = read("src/lib/db/tournament-participant-membership.ts");
  const actions = read("src/lib/db/tournament-participant-membership-actions.ts");
  const mtpActions = read("src/lib/db/mein-turnierplan-participants-actions.ts");
  const manualActions = read("src/lib/db/tournament-participants-actions.ts");
  const adminActions = read("src/lib/db/admin-actions.ts");
  const groupsBoard = read("src/components/admin/TournamentGroupsBoard.tsx");
  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const persist = read("src/lib/db/plan-schedule-persist.ts");
  const externalPanel = read("src/components/admin/ExternalTeamsParticipationPanel.tsx");
  const participantsPanel = read("src/components/admin/TournamentParticipantsPanel.tsx");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");

  assert(!pure.includes("createClient") && !pure.includes("supabase"), "pure helper has no DB");

  // 1 + 2: direct group-only requires schedule.manage; not teams.manage alone
  const removeGroupFn = sliceFn(
    actions,
    "export async function removeParticipantFromGroupAction",
    "export async function removeTournamentParticipantAction",
  );
  assert(
    removeGroupFn.includes("requireScheduleManage") &&
      !removeGroupFn.includes("requireTeamsManage") &&
      removeGroupFn.includes("assertParticipantMembershipMutationAllowed") &&
      removeGroupFn.includes("deleteTournamentOwnedGroupMembership") &&
      removeGroupFn.includes("hadMembership") &&
      removeGroupFn.includes("verifiedAbsent") &&
      removeGroupFn.includes("PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE") &&
      !removeGroupFn.includes("getTournamentParticipants"),
    "1/2/9: Aus Gruppe entfernen requires schedule.manage + existing membership; no confirmed-set gate",
  );
  passed += 1;

  // Post-delete verification in helper
  assert(
    dbHelper.includes("loadTournamentOwnedMembershipIds") &&
      dbHelper.includes("Authoritative post-delete reread") &&
      dbHelper.includes("after.memberIds.length > 0") &&
      dbHelper.includes("PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE") &&
      dbHelper.includes("verifiedAbsent: true") &&
      dbHelper.includes("hadMembership: false") &&
      dbHelper.includes("hadMembership: true") &&
      !dbHelper.includes("deletedCount: memberIds.length"),
    "6/7/8: post-delete reread; false-success DELETE not treated as success",
  );
  passed += 1;

  // Participant exit permissions + verified cleanup gate
  const removeParticipantFn = sliceFn(
    actions,
    "export async function removeTournamentParticipantAction",
  );
  assert(
    removeParticipantFn.includes("requireApplicationsManage") &&
      removeParticipantFn.includes("requireTeamsManage") &&
      removeParticipantFn.includes("canProceedParticipantExitAfterMembershipCleanup") &&
      removeParticipantFn.indexOf("canProceedParticipantExitAfterMembershipCleanup") <
        removeParticipantFn.indexOf(".update({ status: nextStatus })") &&
      removeParticipantFn.includes('resolveParticipantExitTransition("application")') &&
      removeParticipantFn.includes('resolveParticipantExitTransition("mein-turnierplan")') &&
      removeParticipantFn.includes('resolveParticipantExitTransition("manual")') &&
      !removeParticipantFn.includes('from("applications").delete') &&
      !removeParticipantFn.includes('from("tournament_external_teams").delete'),
    "3/4/5/6/14: exit uses source permissions + verified cleanup before status; rows preserved",
  );
  passed += 1;

  // Exit path hooks
  const setStatusFn = sliceFn(mtpActions, "async function setParticipationStatus");
  assert(
    setStatusFn.includes("leavingConfirmed") &&
      setStatusFn.includes("canProceedParticipantExitAfterMembershipCleanup") &&
      setStatusFn.indexOf("canProceedParticipantExitAfterMembershipCleanup") <
        setStatusFn.indexOf("participation_status: input.status"),
    "external exit blocked unless cleanup verified",
  );

  const deactivateFn = sliceFn(
    manualActions,
    "export async function deactivateManualTournamentParticipantAction",
  );
  assert(
    deactivateFn.includes("canProceedParticipantExitAfterMembershipCleanup") &&
      deactivateFn.indexOf("canProceedParticipantExitAfterMembershipCleanup") <
        deactivateFn.indexOf("external_active: false"),
    "manual exit blocked unless cleanup verified",
  );

  const appStatusFn = sliceFn(adminActions, "export async function updateApplicationStatusAction");
  assert(
    appStatusFn.includes('previousStatus === "accepted"') &&
      appStatusFn.includes("canProceedParticipantExitAfterMembershipCleanup") &&
      appStatusFn.indexOf("canProceedParticipantExitAfterMembershipCleanup") <
        appStatusFn.indexOf(".update({ status })"),
    "application exit blocked unless cleanup verified (RLS false-success)",
  );
  passed += 1;

  // 10: stale cleanup does not change status in group-only action
  assert(
    !removeGroupFn.includes("participation_status") &&
      !removeGroupFn.includes("external_active") &&
      !removeGroupFn.includes(".update({ status"),
    "10: Aus Gruppe entfernen does not mutate participant status",
  );
  passed += 1;

  // Revalidation gaps fixed
  assert(
    mtpActions.includes(`/admin/turniere/\${tournamentId}/spielplan`) ||
      mtpActions.includes("/spielplan"),
    "reject path revalidates spielplan",
  );
  assert(
    manualActions.includes(`/admin/turniere/\${tournamentId}/spielplan`) ||
      manualActions.includes("/spielplan"),
    "deactivate path revalidates spielplan",
  );
  assert(
    appStatusFn.includes("/spielplan"),
    "application status exit revalidates spielplan",
  );
  assert(
    actions.includes("/gruppen") && actions.includes("/spielplan"),
    "new actions revalidate gruppen + spielplan",
  );
  passed += 1;

  // Schedule safety / groups board / persist
  assert(
    !actions.includes('from("tournament_matches").delete') &&
      groupsBoard.includes("assignTeamToGroupAction") &&
      scheduleActions.includes("export async function assignTeamToGroupAction") &&
      scheduleActions.includes("requireScheduleManage") &&
      persist.includes("resolveScheduleParticipantRef") &&
      persist.includes(
        "Ein Spielplan-Team konnte keinem bestätigten Teilnehmer zugeordnet werden.",
      ),
    "15: persist fail-closed + groups board + no schedule auto-delete",
  );
  passed += 1;

  // UI
  assert(
    externalPanel.includes("Aus Gruppe entfernen") &&
      externalPanel.includes("isStaleGrouped") &&
      externalPanel.includes("Ablehnen") &&
      participantsPanel.includes("Teilnehmer entfernen") &&
      participantsPanel.includes("ConfirmModal"),
    "UI surfaces for stale cleanup + participant removal",
  );
  passed += 1;

  // Freeze
  assert(!dbHelper.includes(".rpc(") && !actions.includes(".rpc("), "no RPC");
  assert(
    runChecksCli.includes("runTournamentParticipantMembershipChecks"),
    "checks wired into run-checks-cli",
  );
  passed += 1;

  return `ok (${passed} assertion groups; pure+structural only, no live RLS integration)`;
}
