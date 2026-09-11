import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPLICATION_HARD_DELETE_BLOCKED_MESSAGE,
  evaluateApplicationHardDeleteGuard,
} from "@/lib/applications/application-delete-guard";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

export function runApplicationArchiveDeleteChecks() {
  const migration = read(
    "supabase/migrations/20260911120000_applications_archived_at.sql",
  );
  const adminActions = read("src/lib/db/admin-actions.ts");
  const adminLib = read("src/lib/admin.ts");
  const duplicateMigration = read(
    "supabase/migrations/20260828100000_prevent_duplicate_team_applications.sql",
  );
  const occupancyMigration = read(
    "supabase/migrations/20260820153200_tournament_occupancy.sql",
  );

  assert(
    migration.includes("ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL"),
    "migration must add nullable archived_at",
  );
  assert(!migration.includes("DROP COLUMN"), "migration must not drop columns");
  assert(
    !/\bUPDATE\b/i.test(migration),
    "migration must not rewrite existing application rows",
  );
  assert(
    !migration.includes("applications_tournament_team_unique_idx"),
    "migration must not recreate/alter the duplicate unique index",
  );

  assert(
    duplicateMigration.includes("applications_tournament_team_unique_idx"),
    "duplicate unique index migration must remain intact",
  );
  assert(
    !duplicateMigration.includes("archived_at"),
    "duplicate unique index must not depend on archived_at",
  );

  assert(
    !occupancyMigration.includes("archived_at"),
    "occupancy migration must not filter archived_at",
  );

  assert(
    adminActions.includes("archiveApplicationAction"),
    "archiveApplicationAction must exist",
  );
  assert(
    adminActions.includes("restoreApplicationAction"),
    "restoreApplicationAction must exist",
  );
  assert(
    adminActions.includes("deleteApplicationAction"),
    "deleteApplicationAction must exist",
  );
  assert(
    adminActions.includes("evaluateApplicationHardDeleteGuard"),
    "delete must use server-side delete guard",
  );
  assert(
    adminActions.includes("APPLICATION_HARD_DELETE_BLOCKED_MESSAGE"),
    "blocked delete must surface archive recommendation message",
  );

  const archiveStart = adminActions.indexOf(
    "export async function archiveApplicationAction",
  );
  const restoreStart = adminActions.indexOf(
    "export async function restoreApplicationAction",
  );
  assert(archiveStart >= 0 && restoreStart > archiveStart, "archive action bounds");
  const archiveFn = adminActions.slice(archiveStart, restoreStart);
  assert(archiveFn.includes("archived_at"), "archive must set archived_at");
  assert(!archiveFn.includes("status:"), "archive must not update application status");
  assert(!archiveFn.includes(".delete("), "archive must not delete rows");

  const deleteStart = adminActions.indexOf(
    "export async function deleteApplicationAction",
  );
  const deleteFn = adminActions.slice(deleteStart, deleteStart + 3500);
  assert(
    deleteFn.includes("tournament_matches"),
    "delete guard must inspect tournament_matches",
  );
  assert(
    deleteFn.includes("tournament_group_members"),
    "delete guard must inspect tournament_group_members",
  );
  assert(
    deleteFn.includes("cancellation_requests"),
    "delete guard must inspect cancellation_requests",
  );
  assert(
    deleteFn.includes("secure_access_tokens"),
    "delete guard must inspect secure_access_tokens",
  );
  assert(
    !deleteFn.includes('.from("tournament_matches").delete'),
    "delete must never remove matches to force application deletion",
  );
  assert(
    !deleteFn.includes('.from("tournament_group_members").delete'),
    "delete must never remove group members to force application deletion",
  );
  assert(
    !deleteFn.includes('.from("cancellation_requests").delete'),
    "delete must never remove cancellations to force application deletion",
  );

  assert(
    adminLib.includes('archive: "active"'),
    "default application filter must hide archived rows",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "accepted",
      paymentStatus: "pending",
      paidAt: null,
      matchCount: 0,
      groupMemberCount: 0,
      cancellationCount: 0,
      secureTokenCount: 0,
    }).allowed,
    "accepted applications must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "waiting-list",
      paymentStatus: "pending",
      paidAt: null,
      matchCount: 0,
      groupMemberCount: 0,
      cancellationCount: 0,
      secureTokenCount: 0,
    }).allowed,
    "waiting-list applications must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "new",
      paymentStatus: "pending",
      paidAt: null,
      matchCount: 1,
      groupMemberCount: 0,
      cancellationCount: 0,
      secureTokenCount: 0,
    }).allowed,
    "applications with matches must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "pending",
      paidAt: null,
      matchCount: 0,
      groupMemberCount: 1,
      cancellationCount: 0,
      secureTokenCount: 0,
    }).allowed,
    "applications in groups must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "pending",
      paidAt: null,
      matchCount: 0,
      groupMemberCount: 0,
      cancellationCount: 1,
      secureTokenCount: 0,
    }).allowed,
    "applications with cancellation history must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "paid",
      paidAt: "2026-01-01T00:00:00.000Z",
      matchCount: 0,
      groupMemberCount: 0,
      cancellationCount: 0,
      secureTokenCount: 0,
    }).allowed,
    "paid applications must not be hard-deletable",
  );

  assert(
    evaluateApplicationHardDeleteGuard({
      status: "new",
      paymentStatus: "pending",
      paidAt: null,
      matchCount: 0,
      groupMemberCount: 0,
      cancellationCount: 0,
      secureTokenCount: 0,
    }).allowed,
    "safe new applications without dependencies may be hard-deleted",
  );

  assert(
    evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "not_required",
      paidAt: null,
      matchCount: 0,
      groupMemberCount: 0,
      cancellationCount: 0,
      secureTokenCount: 0,
    }).allowed,
    "rejected applications without history may be hard-deleted",
  );

  assert(
    APPLICATION_HARD_DELETE_BLOCKED_MESSAGE.includes("archiviere"),
    "blocked message must recommend archive",
  );

  return "ok";
}
