import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

export function runCommunicationHardDeleteChecks() {
  const migration = read(
    "supabase/migrations/20260916210000_hard_delete_archived_communication_rpc.sql",
  );
  const center = read("supabase/migrations/20260830120000_communication_center.sql");
  const receipts = read(
    "supabase/migrations/20260831120000_communication_receipts.sql",
  );
  const actions = read("src/lib/communications/actions.ts");
  const hardDeleteUi = read(
    "src/components/admin/CommunicationHardDeleteControls.tsx",
  );
  const listBoard = read("src/components/admin/CommunicationListBoard.tsx");
  const detailView = read("src/components/admin/CommunicationDetailView.tsx");
  const archiveControls = read(
    "src/components/admin/CommunicationArchiveControls.tsx",
  );
  const mail = read("src/lib/communications/communication-mail.ts");
  const grantUpdate = read(
    "supabase/migrations/20260916190000_communication_table_update_grant.sql",
  );
  const grantSelect = read(
    "supabase/migrations/20260901140000_communication_table_select_grants.sql",
  );

  assert(
    migration.includes(
      "CREATE OR REPLACE FUNCTION public.hard_delete_archived_communication",
    ),
    "hard delete RPC exists",
  );
  assert(
    migration.includes("SECURITY DEFINER") &&
      migration.includes("SET search_path = public"),
    "RPC is SECURITY DEFINER with locked search_path",
  );
  assert(
    migration.includes(
      "IF NOT public.has_rbac_permission('communications.manage') THEN",
    ),
    "RPC requires communications.manage",
  );
  assert(
    migration.includes("AND archived_at IS NOT NULL") &&
      migration.includes("AND status IS DISTINCT FROM 'sending'"),
    "DELETE itself requires archived + not-sending",
  );
  assert(
    migration.includes("DELETE FROM public.tournament_communications") &&
      migration.includes("WHERE id = p_communication_id"),
    "DELETE targets exact communication id",
  );
  assert(
    migration.includes("RETURN 'not_found'") &&
      migration.includes("RETURN 'sending'") &&
      migration.includes("RETURN 'not_archived'") &&
      migration.includes("RETURN 'deleted'"),
    "RPC distinguishes zero-row outcomes",
  );
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.hard_delete_archived_communication(uuid)") &&
      migration.includes("FROM PUBLIC, anon") &&
      migration.includes(
        "GRANT EXECUTE ON FUNCTION public.hard_delete_archived_communication(uuid)",
      ) &&
      migration.includes("TO authenticated"),
    "EXECUTE granted only to authenticated",
  );
  assert(
    !migration.includes("GRANT DELETE") &&
      !migration.includes("TO anon") &&
      !migration.toLowerCase().includes("service_role"),
    "no table DELETE grant / anon / service_role",
  );

  // Existing cascade model
  assert(
    center.includes(
      "REFERENCES public.tournament_communications (id) ON DELETE CASCADE",
    ),
    "recipients CASCADE from communications",
  );
  assert(
    center.includes(
      "REFERENCES public.communication_recipients (id) ON DELETE CASCADE",
    ) && center.includes("communication_email_send_keys"),
    "send keys CASCADE from recipients",
  );
  assert(
    receipts.includes(
      "REFERENCES public.communication_recipients (id) ON DELETE CASCADE",
    ) && receipts.includes("communication_confirmation_tokens"),
    "confirmation tokens CASCADE from recipients",
  );
  assert(
    center.includes("email_logs_communication_recipient_id_fkey") &&
      center.includes("ON DELETE SET NULL"),
    "email_logs preserved via ON DELETE SET NULL",
  );
  assert(
    !migration.includes("email_logs") ||
      !migration.includes("DELETE FROM public.email_logs"),
    "hard delete RPC does not delete email_logs",
  );

  // Action
  const deleteStart = actions.indexOf(
    "export async function deleteArchivedCommunicationAction",
  );
  const restoreStart = actions.indexOf(
    "export async function restoreCommunicationAction",
  );
  assert(deleteStart >= 0, "deleteArchivedCommunicationAction exists");
  const deleteBlock = actions.slice(
    deleteStart,
    restoreStart > deleteStart ? restoreStart : undefined,
  );
  assert(
    deleteBlock.includes('requirePermissionAccess("communications.manage")'),
    "delete action requires communications.manage",
  );
  assert(
    deleteBlock.includes("!current.archived_at") &&
      deleteBlock.includes(
        "Nur archivierte Nachrichten können endgültig gelöscht werden.",
      ),
    "active communications blocked server-side",
  );
  assert(
    deleteBlock.includes('status === "sending"') &&
      deleteBlock.includes("Laufende Versände können nicht gelöscht werden."),
    "sending blocked server-side",
  );
  assert(
    deleteBlock.includes('rpc(\n    "hard_delete_archived_communication"') ||
      deleteBlock.includes('rpc("hard_delete_archived_communication"'),
    "delete uses hard_delete_archived_communication RPC",
  );
  assert(
    !deleteBlock.includes(".delete(") &&
      !deleteBlock.includes('from("tournament_communications")\n    .delete'),
    "action does not use direct table DELETE",
  );
  assert(
    !deleteBlock.includes("sendTournamentCommunication") &&
      !deleteBlock.includes("initiate_communication_send"),
    "delete must not call send paths",
  );
  assert(
    deleteBlock.includes('outcome === "sending"') &&
      deleteBlock.includes('outcome === "not_archived"') &&
      deleteBlock.includes('outcome === "not_found"'),
    "action interprets RPC zero-row outcomes",
  );

  // No DELETE table privilege added by F3A grants
  assert(
    !grantUpdate.includes("GRANT DELETE") && !grantSelect.includes("GRANT DELETE"),
    "existing grant migrations do not grant DELETE",
  );

  // UI
  assert(
    hardDeleteUi.includes("ConfirmModal") &&
      hardDeleteUi.includes("endgültig gelöscht") &&
      hardDeleteUi.includes("nicht rückgängig") &&
      hardDeleteUi.includes("Empfangsbestätigungen") &&
      hardDeleteUi.includes("E-Mail-Protokolle bleiben erhalten"),
    "hard delete confirmation warns irreversibly and preserves email_logs messaging",
  );
  assert(
    hardDeleteUi.includes("deleteArchivedCommunicationAction"),
    "UI calls delete action",
  );
  assert(
    listBoard.includes("CommunicationHardDeleteControls") &&
      listBoard.includes("{archived ? (") &&
      listBoard.includes("<CommunicationHardDeleteControls"),
    "list shows hard delete only when archived",
  );
  assert(
    detailView.includes("CommunicationHardDeleteControls") &&
      detailView.includes("{archived ? (") &&
      detailView.includes("<CommunicationHardDeleteControls"),
    "detail shows hard delete only when archived",
  );
  assert(
    !archiveControls.includes("deleteArchivedCommunicationAction") &&
      !archiveControls.includes("Endgültig löschen"),
    "archive/restore controls do not include hard delete",
  );
  assert(
    !mail.includes("hard_delete_archived_communication") &&
      !mail.includes("deleteArchivedCommunicationAction"),
    "mail module not coupled to hard delete",
  );

  return "ok";
}
