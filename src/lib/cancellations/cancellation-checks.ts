import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cancellationRequestStatusLabel,
  isArchivedCancellationStatus,
  partitionCancellationRequests,
  selectCancellationRequestsForTab,
} from "@/lib/cancellations/cancellation-archive";
import {
  isLateCancellationRequest,
  requiresCancellationReason,
} from "@/lib/cancellations/deadline";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
  isValidSecureAccessTokenFormat,
} from "@/lib/cancellations/tokens";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";
import type { CancellationRequestListItem } from "@/types/cancellation";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260829160000_cancellation_requests.sql"),
    "utf8",
  );
}

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/cancellations/actions.ts"), "utf8");
}

function readMail() {
  return readFileSync(join(process.cwd(), "src/lib/cancellations/cancellation-mail.ts"), "utf8");
}

function readStatusMail() {
  return readFileSync(join(process.cwd(), "src/lib/email/status-mail.ts"), "utf8");
}

function readFaq() {
  return readFileSync(
    join(process.cwd(), "src/lib/help/turnierhub-knowledge.ts"),
    "utf8",
  );
}

export function runCancellationRequestsChecks() {
  const migration = readMigration();
  const actions = readActions();
  const mail = readMail();
  const statusMail = readStatusMail();
  const faq = readFaq();

  assert(migration.includes("'cancelled'"), "migration adds cancelled status");
  assert(migration.includes("cancellation_requests"), "migration creates cancellation_requests");
  assert(migration.includes("secure_access_tokens"), "migration creates secure_access_tokens");
  assert(migration.includes("token_hash text NOT NULL"), "token hash column exists");
  assert(migration.includes("char_length(token_hash) = 64"), "token hash length constrained");
  assert(migration.includes("cancellation_requests_one_pending_per_application"), "unique pending index");
  assert(migration.includes("decide_cancellation_request"), "decide RPC exists");
  assert(migration.includes("submit_cancellation_request_external"), "external submit RPC exists");
  assert(migration.includes("cancellation_email_send_keys"), "cancellation email idempotency table");
  assert(migration.includes("public_action_attempts"), "rate limit table exists");
  assert(migration.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
  assert(!migration.includes("public.upsert_status_email_template("), "no upsert_status_email_template dependency");
  assert(migration.includes("IF EXISTS (SELECT 1 FROM public.email_templates WHERE type = v_type)"), "idempotent template seeding by type");
  assert(migration.includes("cancellation-request-submitted"), "cancellation-request-submitted template seeded");
  assert(migration.includes("{{participation_url}}"), "application-accepted participation_url placeholder");

  assert(actions.includes("submitClubCancellationRequestAction"), "club action exists");
  assert(actions.includes("submitExternalCancellationRequestAction"), "external action exists");
  assert(actions.includes("decideCancellationRequestAction"), "admin decide action exists");
  assert(actions.includes("requireCancellationsManage"), "admin authorization used");
  assert(!actions.includes("decide_cancellation_request") || actions.includes("requireCancellationsManage"), "club cannot decide");

  assert(mail.includes("reserve_cancellation_email_send"), "cancellation mail idempotency");
  assert(mail.includes("cancellation-request-received"), "admin notification template");
  assert(mail.includes("cancellation-confirmed"), "confirmation template");
  assert(!mail.includes("reserve_application_status_email_send"), "status idempotency untouched");

  assert(statusMail.includes("ensureParticipationCancellationToken"), "accepted mail can issue token");
  assert(statusMail.includes("participation_url"), "accepted mail supports participation url");

  assert(faq.includes('id: "absage"'), "FAQ absage entry exists");
  assert(faq.includes("14 Tage"), "FAQ mentions 14-day rule");
  assert(faq.includes("Absageanfrage"), "FAQ uses request wording");

  // A: club >=14 days
  const onTimeDate = new Date();
  onTimeDate.setUTCDate(onTimeDate.getUTCDate() + 20);
  const onTimeIso = onTimeDate.toISOString().slice(0, 10);
  assert(!requiresCancellationReason(onTimeIso), "A: >=14 days no required reason");

  // B: club <14 days without reason blocked at validation layer
  const lateDate = new Date();
  lateDate.setUTCDate(lateDate.getUTCDate() + 5);
  const lateIso = lateDate.toISOString().slice(0, 10);
  assert(requiresCancellationReason(lateIso), "B: <14 days requires reason");

  // C: <14 with reason allowed
  assert(isLateCancellationRequest(lateIso), "C: late window detected");

  // D-G token security
  const token = generateSecureAccessToken();
  assert(token.length >= 32, "D: token length sufficient");
  assert(isValidSecureAccessTokenFormat(token), "D: token format valid");
  const hash = hashSecureAccessToken(token);
  assert(hash.length === 64, "Q: sha256 hex hash length");
  assert(!hash.includes(token), "Q: hash is not plaintext token");

  // E/F/G purpose and invalid
  assert(migration.includes("p_purpose public.secure_access_token_purpose"), "G: purpose scoped");
  assert(!isValidSecureAccessTokenFormat("not valid!"), "F: invalid token format blocked");

  // H duplicate pending via unique index
  assert(
    migration.includes("WHERE status = 'pending'"),
    "H: pending uniqueness enforced",
  );

  // I/J/K capacity semantics via existing helper
  const pendingCapacity = countApplicationsByStatus(["accepted", "waiting-list"]);
  assert(pendingCapacity.confirmedTeams === 1, "I: accepted counts toward capacity");
  const afterCancel = countApplicationsByStatus(["cancelled"]);
  assert(afterCancel.confirmedTeams === 0, "J: cancelled does not count toward capacity");

  const stillAccepted = countApplicationsByStatus(["accepted"]);
  assert(stillAccepted.confirmedTeams === 1, "K: accepted still counts until cancelled");

  // L/M via decide RPC text
  assert(
    migration.includes("status = 'cancelled'::public.application_status"),
    "L: confirm sets cancelled",
  );
  assert(
    migration.includes("status = 'rejected'") || migration.includes("status = 'rejected'::public.cancellation_request_status"),
    "M: reject leaves application path separate",
  );

  // N cancelled not accepted
  assert(
    migration.includes("v_app.status IS DISTINCT FROM 'accepted'"),
    "N: external token invalid when not accepted",
  );

  // O no auto-promotion in code
  assert(
    !migration.includes("waiting-list") || !migration.toLowerCase().includes("auto"),
    "O: no auto waitlist promotion",
  );
  assert(
    readFileSync(join(process.cwd(), "src/components/admin/AdminTournamentDetailView.tsx"), "utf8")
      .includes("Freier Startplatz"),
    "O: admin hint present",
  );

  // P cancellation email idempotency separate
  assert(mail.includes("cancellation_email_send_keys") || mail.includes("reserve_cancellation_email_send"), "P: idempotency");

  // R club cannot decide
  assert(actions.includes("requireCancellationsManage"), "R: admin guard on decide");

  const board = readFileSync(
    join(process.cwd(), "src/components/admin/CancellationRequestsBoard.tsx"),
    "utf8",
  );
  const queries = readFileSync(
    join(process.cwd(), "src/lib/cancellations/queries.ts"),
    "utf8",
  );
  const absagenPage = readFileSync(
    join(process.cwd(), "src/app/admin/absagen/page.tsx"),
    "utf8",
  );
  const absagenLayout = readFileSync(
    join(process.cwd(), "src/app/admin/absagen/layout.tsx"),
    "utf8",
  );

  const sampleRequests: CancellationRequestListItem[] = [
    {
      id: "req-pending",
      applicationId: "app-1",
      requestedByType: "club",
      reason: "Verletzung im Kader",
      isLateRequest: false,
      status: "pending",
      requestedAt: "2026-09-01T10:00:00.000Z",
      decidedAt: null,
      decidedBy: null,
      adminNote: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
      tournamentName: "G-Junioren Hallenturnier",
      tournamentSlug: "g-junioren",
      tournamentDate: "2026-12-01",
      clubName: "TSV Jesingen",
      teamName: "Jesingen U7",
      contactFirstName: "Max",
      contactLastName: "Mustermann",
      contactEmail: "max@example.com",
      applicationStatus: "accepted",
      daysUntilTournament: 20,
    },
    {
      id: "req-confirmed",
      applicationId: "app-2",
      requestedByType: "external",
      reason: "Terminüberschneidung",
      isLateRequest: true,
      status: "confirmed",
      requestedAt: "2026-08-01T10:00:00.000Z",
      decidedAt: "2026-08-02T12:00:00.000Z",
      decidedBy: "admin-1",
      adminNote: "Platz freigegeben",
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-02T12:00:00.000Z",
      tournamentName: "U10 Soccer Cup",
      tournamentSlug: "u10-soccer-cup",
      tournamentDate: "2026-11-01",
      clubName: "SV Kirchheim",
      teamName: "Kirchheim U10",
      contactFirstName: "Erika",
      contactLastName: "Muster",
      contactEmail: "erika@example.com",
      applicationStatus: "cancelled",
      daysUntilTournament: null,
    },
    {
      id: "req-rejected",
      applicationId: "app-3",
      requestedByType: "club",
      reason: "Zu kurzfristig ohne Begründung",
      isLateRequest: true,
      status: "rejected",
      requestedAt: "2026-07-01T10:00:00.000Z",
      decidedAt: "2026-07-02T09:00:00.000Z",
      decidedBy: "admin-2",
      adminNote: null,
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-02T09:00:00.000Z",
      tournamentName: "U12 Master Cup",
      tournamentSlug: "u12-master-cup",
      tournamentDate: "2026-10-01",
      clubName: "FC Muster",
      teamName: "Muster U12",
      contactFirstName: "Tom",
      contactLastName: "Test",
      contactEmail: "tom@example.com",
      applicationStatus: "accepted",
      daysUntilTournament: null,
    },
  ];

  const { active, archived } = partitionCancellationRequests(sampleRequests);
  assert(
    active.length === 1 && active[0]?.id === "req-pending",
    "pending requests in active tab",
  );
  assert(
    archived.some((request) => request.id === "req-confirmed"),
    "confirmed requests in archive",
  );
  assert(
    archived.some((request) => request.id === "req-rejected"),
    "rejected requests in archive",
  );
  assert(
    selectCancellationRequestsForTab(sampleRequests, "archive").length === 2,
    "previously processed requests visible",
  );
  assert(active.length === 1 && archived.length === 2, "correct tab counts");

  const confirmed = archived.find((request) => request.id === "req-confirmed");
  assert(
    confirmed?.reason === "Terminüberschneidung",
    "original cancellation reason preserved",
  );
  assert(
    confirmed?.decidedAt === "2026-08-02T12:00:00.000Z",
    "decision timestamps displayed",
  );
  assert(
    confirmed?.adminNote === "Platz freigegeben",
    "admin note displayed when available",
  );
  assert(
    cancellationRequestStatusLabel.confirmed === "Bestätigt" &&
      cancellationRequestStatusLabel.rejected === "Abgelehnt" &&
      cancellationRequestStatusLabel.pending === "Offen",
    "clear German status labels",
  );
  assert(isArchivedCancellationStatus("confirmed"), "confirmed is archived");
  assert(isArchivedCancellationStatus("rejected"), "rejected is archived");
  assert(!isArchivedCancellationStatus("pending"), "pending is not archived");

  assert(board.includes("Offene Absagen"), "active tab label");
  assert(board.includes("Archiv"), "archive tab label");
  assert(
    board.includes('useState<CancellationArchiveTab>("active")'),
    "default tab is active",
  );
  assert(
    board.includes("Keine archivierten Absageanfragen."),
    "empty archive state",
  );
  assert(
    board.includes("Keine offenen Absageanfragen."),
    "empty active state",
  );
  assert(
    board.includes("Absage bestätigen") && board.includes("Absage ablehnen"),
    "pending decision actions unchanged",
  );
  // Archive list must not call decision setters — only active actions do.
  const archiveSectionStart = board.indexOf("function ArchiveRequestsList");
  assert(archiveSectionStart >= 0, "archive list component exists");
  const archiveSection = board.slice(archiveSectionStart);
  assert(
    !archiveSection.includes("setPendingDecision") &&
      !archiveSection.includes("decideCancellationRequestAction") &&
      !archiveSection.includes("Absage bestätigen") &&
      !archiveSection.includes("Absage ablehnen") &&
      !archiveSection.includes(".delete("),
    "archive is read-only",
  );
  assert(
    !board.includes("archived_at") && !queries.includes("archived_at"),
    "no archived_at column introduced",
  );
  const listFnStart = queries.indexOf("export async function listCancellationRequests");
  const listFnEnd = queries.indexOf(
    "export async function getPendingCancellationForApplication",
  );
  assert(listFnStart >= 0 && listFnEnd > listFnStart, "listCancellationRequests present");
  const listFn = queries.slice(listFnStart, listFnEnd);
  assert(
    !listFn.includes('.eq("status"') &&
      listFn.includes('.order("requested_at"'),
    "list query remains unfiltered source of truth",
  );
  assert(
    absagenPage.includes("listCancellationRequests") &&
      !absagenPage.includes("listPendingCancellationRequests"),
    "page uses full listCancellationRequests",
  );
  assert(
    absagenLayout.includes("cancellations.view"),
    "permissions unchanged",
  );
  assert(
    actions.includes("requireCancellationsManage") &&
      actions.includes("decideCancellationRequestAction") &&
      !board.includes("updateApplicationStatus"),
    "no cancellation/application status mutations from tab navigation",
  );
  assert(
    !board.includes(".from(\"cancellation_requests\").delete") &&
      !actions.includes('.from("cancellation_requests").delete'),
    "no deletion of cancellation records",
  );

  const emptyPartition = partitionCancellationRequests([]);
  assert(
    emptyPartition.active.length === 0 && emptyPartition.archived.length === 0,
    "empty partitions for empty input",
  );

  return "ok";
}
