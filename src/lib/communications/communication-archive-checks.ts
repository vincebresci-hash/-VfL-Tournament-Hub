import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCommunicationListItems,
  type CommunicationListRow,
} from "@/lib/communications/list-communications";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(pathFromRoot: string) {
  return readFileSync(join(process.cwd(), pathFromRoot), "utf8");
}

const sampleRow = (overrides: Partial<CommunicationListRow> = {}): CommunicationListRow => ({
  id: "08102560-4fb8-4982-a4fa-c89f4c9acd6d",
  tournament_id: "tournament-1",
  recipient_source: "tournament-applications",
  type: "general",
  subject: "Test",
  important: false,
  require_confirmation: true,
  recipient_filter: "accepted",
  status: "sent",
  recipient_count: 1,
  sent_count: 1,
  failed_count: 0,
  created_at: "2026-09-01T10:00:00.000Z",
  sent_at: "2026-09-01T10:01:00.000Z",
  archived_at: null,
  ...overrides,
});

export function runCommunicationArchiveChecks() {
  const migration = read(
    "supabase/migrations/20260830120000_communication_center.sql",
  );
  const actions = read("src/lib/communications/actions.ts");
  const queries = read("src/lib/communications/queries.ts");
  const listPage = read("src/app/admin/kommunikation/page.tsx");
  const listBoard = read("src/components/admin/CommunicationListBoard.tsx");
  const detailView = read("src/components/admin/CommunicationDetailView.tsx");
  const mail = read("src/lib/communications/communication-mail.ts");
  const permissions = read("src/lib/rbac/permissions.ts");

  // Existing column reused — no hard delete in this PR
  assert(migration.includes("archived_at timestamptz"), "archived_at column exists");
  assert(
    !actions.includes(".delete(") && !actions.includes('from("tournament_communications")\n    .delete'),
    "no hard delete in communication actions",
  );

  const archiveStart = actions.indexOf("export async function archiveCommunicationAction");
  const restoreStart = actions.indexOf("export async function restoreCommunicationAction");
  const loadStart = actions.indexOf("export async function loadCommunicationsAction");
  assert(archiveStart >= 0, "archiveCommunicationAction exists");
  assert(restoreStart >= 0, "restoreCommunicationAction exists");

  const archiveBlock = actions.slice(
    archiveStart,
    restoreStart > archiveStart ? restoreStart : undefined,
  );
  const restoreBlock = actions.slice(
    restoreStart,
    loadStart > restoreStart ? loadStart : undefined,
  );

  assert(
    archiveBlock.includes('requirePermissionAccess("communications.manage")'),
    "archive requires communications.manage",
  );
  assert(
    restoreBlock.includes('requirePermissionAccess("communications.manage")'),
    "restore requires communications.manage",
  );
  assert(
    !archiveBlock.includes("communications.send"),
    "archive must not accept send-only permission",
  );
  assert(
    archiveBlock.includes('status === "sending"'),
    "archive blocks sending status",
  );
  assert(
    archiveBlock.includes("archived_at: new Date().toISOString()") ||
      archiveBlock.includes("archived_at: new Date()"),
    "archive sets archived_at",
  );

  // Atomic TOCTOU guard: NOT-SENDING must be on the UPDATE itself
  const archiveUpdateStart = archiveBlock.indexOf(".update({ archived_at:");
  assert(archiveUpdateStart >= 0, "archive UPDATE sets archived_at");
  const archiveUpdateTail = archiveBlock.slice(archiveUpdateStart);
  const archiveUpdateEndCandidates = [
    archiveUpdateTail.indexOf("if (error)"),
    archiveUpdateTail.indexOf("if (!updated)"),
    archiveUpdateTail.indexOf("revalidatePath"),
  ].filter((index) => index >= 0);
  const archiveUpdateEnd =
    archiveUpdateEndCandidates.length > 0
      ? Math.min(...archiveUpdateEndCandidates)
      : archiveUpdateTail.length;
  const archiveUpdateBlock = archiveUpdateTail.slice(0, archiveUpdateEnd);
  assert(
    archiveUpdateBlock.includes('.neq("status", "sending")'),
    "archive UPDATE has atomic NOT-SENDING guard",
  );
  assert(
    archiveUpdateBlock.includes('.is("archived_at", null)'),
    "archive UPDATE only targets active (non-archived) rows",
  );
  assert(
    archiveUpdateBlock.includes('.select("id")'),
    "archive UPDATE returns affected row for result interpretation",
  );
  assert(
    archiveBlock.includes("if (!updated)") &&
      archiveBlock.includes('latest.status === "sending"') &&
      archiveBlock.includes("Laufende Versände können nicht archiviert werden."),
    "zero-row archive UPDATE is interpreted as concurrent sending when applicable",
  );
  assert(
    archiveBlock.includes("Die Nachricht ist bereits archiviert."),
    "already-archived archive path remains idempotent",
  );

  assert(restoreBlock.includes("archived_at: null"), "restore clears archived_at");
  assert(
    !restoreBlock.includes('.neq("status", "sending")'),
    "restore remains unchanged without sending TOCTOU guard",
  );
  assert(
    !archiveBlock.includes("sent_at") &&
      !archiveBlock.includes("sent_count") &&
      !archiveBlock.includes("failed_count") &&
      !archiveBlock.includes("recipient_count") &&
      !archiveBlock.includes("status:"),
    "archive update must not touch send lifecycle fields",
  );
  assert(
    !restoreBlock.includes("sent_at") &&
      !restoreBlock.includes("sent_count") &&
      !restoreBlock.includes("failed_count") &&
      !restoreBlock.includes("recipient_count") &&
      !restoreBlock.includes("status:"),
    "restore update must not touch send lifecycle fields",
  );
  assert(
    !archiveBlock.includes("sendTournamentCommunication") &&
      !restoreBlock.includes("sendTournamentCommunication") &&
      !archiveBlock.includes("initiate_communication_send") &&
      !restoreBlock.includes("initiate_communication_send"),
    "archive/restore must not call send paths",
  );

  // List filters
  const listStart = queries.indexOf("export async function listCommunications");
  const listEnd = queries.indexOf("export async function getCommunicationDetail");
  const listBlock =
    listStart >= 0 && listEnd > listStart ? queries.slice(listStart, listEnd) : "";
  assert(listBlock.includes('.is("archived_at", null)'), "active filter archived_at IS NULL");
  assert(
    listBlock.includes('.not("archived_at", "is", null)'),
    "archive filter archived_at IS NOT NULL",
  );
  assert(listBlock.includes('.neq("status", "draft")'), "non-draft filter preserved");
  assert(listBlock.includes("archived_at"), "list selects archived_at");
  assert(
    queries.includes("archived_at") &&
      queries.includes("getCommunicationDetail") &&
      queries.includes("archivedAt: data.archived_at"),
    "detail exposes archivedAt",
  );

  // UI
  assert(listPage.includes("Aktiv") && listPage.includes("Archiv"), "list tabs present");
  assert(
    listPage.includes('archive=archived') || listPage.includes('"archived"'),
    "archive query param supported",
  );
  assert(
    listPage.includes('"communications.manage"'),
    "list page gates manage capability",
  );
  assert(
    listBoard.includes("CommunicationArchiveControls"),
    "list board uses archive controls",
  );
  assert(
    detailView.includes("CommunicationArchiveControls") &&
      detailView.includes("Archiviert"),
    "detail shows archive controls and archived badge",
  );

  // Mapping preserves archivedAt without inventing side effects
  const activeItem = buildCommunicationListItems({
    rows: [sampleRow()],
    tournamentsById: new Map(),
    confirmedCountsByCommunicationId: new Map(),
  })[0];
  assert(activeItem?.archivedAt === null, "active mapping archivedAt null");
  assert(activeItem?.status === "sent", "status unchanged in mapping");
  assert(activeItem?.sentCount === 1, "sentCount unchanged in mapping");

  const archivedItem = buildCommunicationListItems({
    rows: [sampleRow({ archived_at: "2026-09-02T10:00:00.000Z", subject: "Alt" })],
    tournamentsById: new Map(),
    confirmedCountsByCommunicationId: new Map(),
  })[0];
  assert(
    archivedItem?.archivedAt === "2026-09-02T10:00:00.000Z",
    "archived mapping preserves timestamp",
  );

  // Permissions / send stack unchanged
  assert(permissions.includes("communications.manage"), "manage permission retained");
  assert(mail.includes("sendTournamentCommunication"), "send mail path retained");
  assert(
    !mail.includes("archiveCommunicationAction"),
    "mail module not coupled to archive",
  );

  return "ok";
}
