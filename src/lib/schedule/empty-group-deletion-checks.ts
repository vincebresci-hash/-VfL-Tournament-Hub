import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_GROUP_DELETE_COMPLETED_MESSAGE,
  EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE,
  EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE,
  canAdviseEmptyGroupDeletion,
  emptyGroupDeletionBlockReason,
} from "@/lib/schedule/empty-group-deletion";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`empty-group-deletion-checks: ${message}`);
  }
}

function sliceFn(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `missing start marker ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(end > start, `missing end marker ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

function stripTsComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Pure + structural checks for safe empty-group deletion.
 * Does not hit Supabase / Production.
 */
export function runEmptyGroupDeletionChecks(): string {
  // 1. Empty group without matches
  assert(
    canAdviseEmptyGroupDeletion({
      tournamentCompleted: false,
      memberCount: 0,
      matchCountForGroup: 0,
    }),
    "1 empty group without matches advised",
  );
  assert(
    emptyGroupDeletionBlockReason({
      tournamentCompleted: false,
      memberCount: 0,
      matchCountForGroup: 0,
    }) === null,
    "1 empty group without matches has null block reason",
  );

  // 2. Empty group while unrelated groups have matches (facts are per-group)
  assert(
    canAdviseEmptyGroupDeletion({
      tournamentCompleted: false,
      memberCount: 0,
      matchCountForGroup: 0,
    }),
    "2 empty group advised even when other groups may have matches",
  );

  // 3. Group with members
  assert(
    emptyGroupDeletionBlockReason({
      tournamentCompleted: false,
      memberCount: 2,
      matchCountForGroup: 0,
    }) === EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE,
    "3 group with members blocked",
  );

  // 4. Group with historical/cancelled matches (count > 0 covers all statuses)
  assert(
    emptyGroupDeletionBlockReason({
      tournamentCompleted: false,
      memberCount: 0,
      matchCountForGroup: 1,
    }) === EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE,
    "4 group with matches blocked",
  );

  // 5 + 6. Completed marketing / effective lifecycle (shared completed fact)
  assert(
    emptyGroupDeletionBlockReason({
      tournamentCompleted: true,
      memberCount: 0,
      matchCountForGroup: 0,
    }) === EMPTY_GROUP_DELETE_COMPLETED_MESSAGE,
    "5/6 completed tournament blocked",
  );

  const scheduleActions = read("src/lib/db/schedule-actions.ts");
  const deleteFn = sliceFn(
    scheduleActions,
    "export async function deleteTournamentGroupAction",
    "export async function assignTeamToGroupAction",
  );
  const deleteExec = stripTsComments(deleteFn);
  const groupsBoard = read("src/components/admin/TournamentGroupsBoard.tsx");
  const groupsPage = read("src/app/admin/turniere/[id]/gruppen/page.tsx");
  const pure = read("src/lib/schedule/empty-group-deletion.ts");
  const lifecyclePersist = read("src/lib/db/tournament-lifecycle.ts");
  const runChecksCli = read("src/lib/schedule/run-checks-cli.ts");

  // 7. Insufficient permission
  assert(
    deleteFn.includes("requireScheduleManage"),
    "7 delete requires schedule.manage",
  );

  // Server gates before DELETE
  assert(
    deleteFn.includes("loadTournamentLifecycleSnapshot") &&
      deleteFn.includes("marketingStatusCompleted") &&
      deleteFn.includes('effective === "completed"') &&
      deleteFn.includes("EMPTY_GROUP_DELETE_COMPLETED_MESSAGE"),
    "completed marketing + effective lifecycle guarded",
  );
  assert(
    deleteFn.includes('from("tournament_group_members")') &&
      deleteFn.includes('from("tournament_matches")') &&
      deleteFn.includes('eq("group_id", groupId)') &&
      deleteFn.includes("EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE") &&
      deleteFn.includes("EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE"),
    "authoritative membership + match guards present",
  );
  assert(
    deleteFn.includes('.eq("tournament_id", tournamentId)') &&
      deleteFn.includes('.select("id")'),
    "delete scoped by group + tournament and confirms affected rows",
  );
  assert(
    deleteFn.includes("syncLifecycleAfterGroupsChanged"),
    "lifecycle sync retained after successful delete",
  );

  // 8. Server rejects stale UI eligibility — authoritative re-reads after stage check
  const stageIdx = deleteFn.indexOf("getAdminTournamentStage");
  const membersIdx = deleteFn.indexOf('from("tournament_group_members")');
  const matchesIdx = deleteFn.indexOf('from("tournament_matches")');
  const deleteIdx = deleteExec.search(/\.delete\s*\(/);
  assert(stageIdx >= 0 && membersIdx > stageIdx, "stage load before membership re-read");
  assert(matchesIdx > stageIdx, "stage load before match re-read");
  assert(deleteIdx > membersIdx && deleteIdx > matchesIdx, "DELETE after authoritative guards");

  // 9 + 10. Lifecycle rewind / KO preservation remain on existing sync helper
  assert(
    lifecyclePersist.includes("syncLifecycleAfterGroupsChanged") &&
      lifecyclePersist.includes('groupsExist ? "group_stage" : "setup"') &&
      lifecyclePersist.includes("hasKnockout") &&
      lifecyclePersist.includes('status === "completed"'),
    "9/10 existing lifecycle sync handles last-group rewind and KO/completed freeze",
  );

  // 11 + 12. Assignment + auto-distribution remain globally locked with schedule
  assert(
    groupsBoard.includes("disabled={pending || hasMatches}") &&
      groupsBoard.includes("autoDistributeTeamsAction") &&
      groupsBoard.includes("Zuordnungen sind gesperrt, solange ein Spielplan existiert."),
    "11/12 assignment and distribution remain hasMatches-locked",
  );
  assert(
    !groupsBoard.includes("disabled={pending || hasMatches}\n                  onClick={() => setDeleteGroupId"),
    "delete no longer uses coarse hasMatches disable",
  );
  assert(
    groupsBoard.includes("emptyGroupDeletionBlockReason") &&
      groupsBoard.includes("canAdviseEmptyGroupDeletion") &&
      groupsBoard.includes("matchCountByGroupId") &&
      groupsBoard.includes("tournamentCompleted") &&
      groupsBoard.includes("ConfirmModal"),
    "UI uses per-group advisory eligibility + confirmation",
  );
  assert(
    groupsPage.includes("matchCountByGroupId") &&
      groupsPage.includes("tournamentCompleted") &&
      groupsPage.includes('tournament.status === "completed"'),
    "groups page passes advisory match counts + completed flag",
  );

  // 13. No membership cascade relied upon — refuse when members exist
  assert(
    deleteFn.includes("EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE") &&
      !deleteExec.includes('from("tournament_group_members").delete') &&
      !deleteExec.includes('.from("tournament_group_members").delete'),
    "13 refuses non-empty groups; does not delete memberships explicitly",
  );
  assert(
    deleteFn.includes("ON DELETE CASCADE") || deleteFn.includes("TOCTOU"),
    "13 residual CASCADE/TOCTOU risk documented on delete action",
  );

  // 14. No participant/match deletion introduced on this path
  assert(
    !deleteExec.includes('from("tournament_matches").delete') &&
      !deleteExec.includes('from("applications").delete') &&
      !deleteExec.includes('from("tournament_external_teams").delete'),
    "14 no participant/match deletion on empty-group delete path",
  );

  // Pure helper stays DB-free; messages stable
  assert(
    !pure.includes("createClient") && !pure.includes("supabase"),
    "pure empty-group helper has no DB",
  );
  assert(
    pure.includes(EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE) &&
      pure.includes(EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE) &&
      pure.includes(EMPTY_GROUP_DELETE_COMPLETED_MESSAGE),
    "German block messages exported",
  );

  // Freeze: create/rename still available; delete not gated by hasMatches alone
  assert(
    groupsBoard.includes("createTournamentGroupAction") &&
      groupsBoard.includes("renameTournamentGroupAction") &&
      !/disabled=\{pending \|\| hasMatches\}[\s\S]{0,80}setDeleteGroupId/.test(groupsBoard),
    "create/rename unchanged; delete not coarse-locked by hasMatches",
  );

  assert(
    runChecksCli.includes("runEmptyGroupDeletionChecks") &&
      runChecksCli.includes("empty-group-deletion-checks"),
    "suite wired into run-checks-cli",
  );

  return "ok";
}
