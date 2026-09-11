import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APPLICATION_HARD_DELETE_BLOCKED_MESSAGE,
  APPLICATION_HARD_DELETE_DEPENDENCY_COUNTS_RPC,
  evaluateApplicationHardDeleteGuard,
  parseApplicationHardDeleteDependencyCounts,
} from "@/lib/applications/application-delete-guard";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

const emptyHistory = {
  matchCount: 0,
  groupMemberCount: 0,
  cancellationCount: 0,
  secureTokenCount: 0,
  reviewCount: 0,
  statusEmailSendKeyCount: 0,
  paymentAdminNoteCount: 0,
} as const;

export function runApplicationArchiveDeleteChecks() {
  const migration = read(
    "supabase/migrations/20260911120000_applications_archived_at.sql",
  );
  const dependencyRpcMigration = read(
    "supabase/migrations/20260911153000_application_hard_delete_dependency_counts_rpc.sql",
  );
  const adminActions = read("src/lib/db/admin-actions.ts");
  const adminLib = read("src/lib/admin.ts");
  const duplicateMigration = read(
    "supabase/migrations/20260828100000_prevent_duplicate_team_applications.sql",
  );
  const occupancyMigration = read(
    "supabase/migrations/20260820153200_tournament_occupancy.sql",
  );
  const statusEmailKeysMigration = read(
    "supabase/migrations/20260827200000_status_email_idempotency.sql",
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

  const restoreEnd = adminActions.indexOf(
    "export async function deleteApplicationAction",
  );
  const restoreFn = adminActions.slice(restoreStart, restoreEnd);
  assert(restoreFn.includes("archived_at: null"), "restore must clear archived_at");
  assert(!restoreFn.includes("status:"), "restore must not update application status");
  assert(!restoreFn.includes(".delete("), "restore must not delete rows");

  const deleteStart = restoreEnd;
  const deleteFn = adminActions.slice(deleteStart, deleteStart + 4500);
  assert(
    deleteFn.includes("requireApplicationsManage"),
    "delete must require applications.manage",
  );
  assert(
    deleteFn.includes(APPLICATION_HARD_DELETE_DEPENDENCY_COUNTS_RPC) ||
      deleteFn.includes("APPLICATION_HARD_DELETE_DEPENDENCY_COUNTS_RPC"),
    "delete must use dependency-counts RPC",
  );
  assert(
    deleteFn.includes("parseApplicationHardDeleteDependencyCounts"),
    "delete must parse RPC counts fail-closed",
  );
  assert(
    deleteFn.includes("dependencyError || !dependencyCounts"),
    "delete must fail closed when dependency RPC errors or payload is invalid",
  );
  assert(
    !deleteFn.includes('.from("status_email_send_keys")'),
    "delete must not query status_email_send_keys directly",
  );
  assert(
    !deleteFn.includes('.from("application_payment_admin_notes")'),
    "delete must not query payment admin notes directly (RLS false-allow risk)",
  );
  assert(
    !deleteFn.includes('.from("secure_access_tokens")'),
    "delete must not query secure_access_tokens directly (RLS false-allow risk)",
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
    !deleteFn.includes('.from("application_reviews").delete'),
    "delete must never remove reviews to force application deletion",
  );
  assert(
    !deleteFn.includes('.from("status_email_send_keys").delete'),
    "delete must never remove status email keys to force application deletion",
  );
  assert(
    !deleteFn.includes('.from("application_payment_admin_notes").delete'),
    "delete must never remove payment admin notes to force application deletion",
  );
  assert(
    !deleteFn.includes('.from("secure_access_tokens").delete'),
    "delete must never remove tokens to force application deletion",
  );

  assert(
    dependencyRpcMigration.includes(
      "CREATE OR REPLACE FUNCTION public.get_application_hard_delete_dependency_counts",
    ),
    "dependency RPC migration must create get_application_hard_delete_dependency_counts",
  );
  assert(
    dependencyRpcMigration.includes("SECURITY DEFINER"),
    "dependency RPC must be SECURITY DEFINER",
  );
  assert(
    dependencyRpcMigration.includes("SET search_path = public"),
    "dependency RPC must pin search_path",
  );
  assert(
    dependencyRpcMigration.includes("has_rbac_permission('applications.manage')"),
    "dependency RPC must require applications.manage via has_rbac_permission",
  );
  assert(
    !dependencyRpcMigration.includes("is_admin()"),
    "dependency RPC must not use is_admin()",
  );
  assert(
    dependencyRpcMigration.includes("REVOKE ALL ON FUNCTION public.get_application_hard_delete_dependency_counts(uuid)") &&
      dependencyRpcMigration.includes("FROM PUBLIC, anon"),
    "dependency RPC must revoke PUBLIC and anon",
  );
  assert(
    dependencyRpcMigration.includes(
      "GRANT EXECUTE ON FUNCTION public.get_application_hard_delete_dependency_counts(uuid)",
    ) && dependencyRpcMigration.includes("TO authenticated"),
    "dependency RPC must grant EXECUTE only to authenticated",
  );
  assert(
    !/GRANT\s+EXECUTE[\s\S]*TO\s+anon/i.test(dependencyRpcMigration),
    "dependency RPC must not grant EXECUTE to anon",
  );
  assert(
    !dependencyRpcMigration.includes("GRANT SELECT ON TABLE public.status_email_send_keys"),
    "must not grant SELECT on status_email_send_keys",
  );
  assert(
    !dependencyRpcMigration.includes("INSERT INTO") &&
      !dependencyRpcMigration.includes("UPDATE ") &&
      !dependencyRpcMigration.includes("DELETE FROM"),
    "dependency RPC migration must not mutate application/dependency data",
  );
  assert(
    dependencyRpcMigration.includes("status_email_send_keys") &&
      dependencyRpcMigration.includes("application_payment_admin_notes") &&
      dependencyRpcMigration.includes("secure_access_tokens") &&
      dependencyRpcMigration.includes("application_reviews") &&
      dependencyRpcMigration.includes("cancellation_requests") &&
      dependencyRpcMigration.includes("tournament_group_members") &&
      dependencyRpcMigration.includes("tournament_matches"),
    "dependency RPC must cover all hard-delete CASCADE/RESTRICT tables",
  );
  assert(
    dependencyRpcMigration.includes("RETURNS jsonb"),
    "dependency RPC must return aggregates only (jsonb counts)",
  );

  assert(
    statusEmailKeysMigration.includes(
      "REVOKE ALL ON TABLE public.status_email_send_keys FROM PUBLIC, anon, authenticated",
    ),
    "status_email_send_keys must remain revoked for authenticated",
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
      ...emptyHistory,
    }).allowed,
    "accepted applications must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "waiting-list",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
    }).allowed,
    "waiting-list applications must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "cancelled",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
    }).allowed,
    "cancelled applications must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "new",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
      matchCount: 1,
    }).allowed,
    "applications with matches must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
      groupMemberCount: 1,
    }).allowed,
    "applications in groups must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
      cancellationCount: 1,
    }).allowed,
    "applications with cancellation history must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
      secureTokenCount: 1,
    }).allowed,
    "applications with secure tokens must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "paid",
      paidAt: "2026-01-01T00:00:00.000Z",
      ...emptyHistory,
    }).allowed,
    "paid applications must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "waived",
      paidAt: null,
      ...emptyHistory,
    }).allowed,
    "waived applications must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
      reviewCount: 1,
    }).allowed,
    "applications with reviews must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
      statusEmailSendKeyCount: 1,
    }).allowed,
    "applications with status email send keys must not be hard-deletable",
  );

  assert(
    !evaluateApplicationHardDeleteGuard({
      status: "new",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
      paymentAdminNoteCount: 1,
    }).allowed,
    "applications with payment admin notes must not be hard-deletable",
  );

  assert(
    evaluateApplicationHardDeleteGuard({
      status: "new",
      paymentStatus: "pending",
      paidAt: null,
      ...emptyHistory,
    }).allowed,
    "safe new applications without dependencies may be hard-deleted",
  );

  assert(
    evaluateApplicationHardDeleteGuard({
      status: "rejected",
      paymentStatus: "not_required",
      paidAt: null,
      ...emptyHistory,
    }).allowed,
    "rejected applications without history may be hard-deleted",
  );

  assert(
    parseApplicationHardDeleteDependencyCounts(null) === null,
    "RPC null payload must fail closed",
  );
  assert(
    parseApplicationHardDeleteDependencyCounts({}) === null,
    "RPC empty payload must fail closed",
  );
  assert(
    parseApplicationHardDeleteDependencyCounts({
      match_count: 0,
      group_member_count: 0,
      cancellation_count: 0,
      secure_token_count: 0,
      review_count: 0,
      status_email_send_key_count: 0,
      // payment_admin_note_count missing
    }) === null,
    "RPC missing count keys must fail closed",
  );
  assert(
    parseApplicationHardDeleteDependencyCounts({
      match_count: 0,
      group_member_count: 0,
      cancellation_count: 0,
      secure_token_count: 1,
      review_count: 0,
      status_email_send_key_count: 0,
      payment_admin_note_count: 0,
    })?.secureTokenCount === 1,
    "RPC payload with secure tokens must parse",
  );

  assert(
    APPLICATION_HARD_DELETE_BLOCKED_MESSAGE.includes("archiviere"),
    "blocked message must recommend archive",
  );

  return "ok";
}
