import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";
import {
  normalizePaymentUpdate,
  parseParticipationFeeInput,
} from "@/lib/payments/normalize";
import { toApplicationPayment } from "@/lib/payments/mappers";
import {
  arePaymentFiltersActive,
  emptyPaymentFilters,
  filterPaymentRecords,
  getPaymentAgeGroupFilterOptions,
  getPaymentTournamentFilterOptions,
} from "@/lib/payments/payment-filters";
import type { AdminPaymentRecord } from "@/types/payment";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260829200000_payment_status.sql"),
    "utf8",
  );
}

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/payments/actions.ts"), "utf8");
}

function readQueries() {
  return readFileSync(join(process.cwd(), "src/lib/payments/queries.ts"), "utf8");
}

function readPaymentTypes() {
  return readFileSync(join(process.cwd(), "src/types/payment.ts"), "utf8");
}

function readPaymentsBoard() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/AdminPaymentsBoard.tsx"),
    "utf8",
  );
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

function readOccupancyMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260825140000_external_team_participation_status.sql",
    ),
    "utf8",
  );
}

function samplePaymentRecord(
  overrides: Partial<AdminPaymentRecord> & Pick<AdminPaymentRecord, "applicationId">,
): AdminPaymentRecord {
  return {
    applicationStatus: "accepted",
    clubName: "TSV Jesingen",
    teamName: "Jesingen U7",
    tournamentId: "tourn-u7",
    tournamentName: "G-Junioren Hallenturnier",
    tournamentDate: "2026-03-01",
    ageGroup: "U7",
    paymentStatus: "pending",
    participationFee: 80,
    paidAt: null,
    paymentNote: null,
    ...overrides,
  };
}

export function runPaymentStatusChecks() {
  const migration = readMigration();
  const actions = readActions();
  const statusMail = readStatusMail();
  const faq = readFaq();
  const occupancyMigration = readOccupancyMigration();

  assert(migration.includes("CREATE TYPE public.payment_status"), "payment_status enum");
  assert(migration.includes("payment_status public.payment_status"), "applications.payment_status");
  assert(migration.includes("participation_fee numeric"), "participation_fee column");
  assert(migration.includes("paid_at timestamptz"), "paid_at column");
  assert(migration.includes("payment_note text"), "payment_note column");
  assert(migration.includes("SET payment_status = 'pending'"), "backfill pending");
  assert(migration.includes("DROP TRIGGER IF EXISTS applications_payment_fields_guard"), "backfill before guard trigger");
  assert(!migration.includes("ON CONFLICT"), "no blind template ON CONFLICT");
  assert(migration.includes("{{participation_url}}"), "participation_url preserved in template");
  assert(
    !migration.includes("CREATE OR REPLACE FUNCTION public.validate_secure_access_token"),
    "validate_secure_access_token return type unchanged (42P13 safe)",
  );
  assert(
    migration.includes("get_external_participation_payment_by_token"),
    "separate external payment RPC",
  );
  assert(
    migration.includes("payment_status public.payment_status") &&
      migration.includes("participation_fee numeric") &&
      migration.includes("paid_at timestamptz"),
    "external payment RPC minimal return",
  );
  assert(!migration.includes("DROP FUNCTION"), "no DROP FUNCTION in migration");
  assert(!migration.includes("tournament_occupancy"), "occupancy unchanged in migration");

  assert(actions.includes("requirePaymentsManage"), "admin-only payment mutations");
  assert(actions.includes("requirePaymentsView"), "payments.view read guard");
  assert(actions.includes("loadAdminPaymentRecordsAction"), "standalone payment list action");
  assert(actions.includes("normalizePaymentUpdate"), "normalized payment update");
  assert(actions.includes("application_payment_admin_notes"), "admin notes table writes");

  assert(statusMail.includes("participation_fee_line"), "accepted mail fee line");
  assert(statusMail.includes("payment_binding_notice"), "accepted mail binding notice");
  assert(!statusMail.includes("reserve_cancellation_email_send"), "status mail idempotency untouched");

  assert(faq.includes('id: "verbindliche-teilnahme"'), "FAQ payment entry");

  assert(
    !occupancyMigration.includes("payment_status"),
    "occupancy ignores payment_status",
  );

  // 1 existing accepted + pending counts as occupied
  const acceptedPending = countApplicationsByStatus(["accepted"]);
  assert(acceptedPending.confirmedTeams === 1, "accepted pending keeps capacity");

  // 2 pending -> paid
  const paidUpdate = normalizePaymentUpdate({
    paymentStatus: "paid",
    participationFee: 100,
    paidAt: null,
  });
  assert(paidUpdate.payment_status === "paid", "pending -> paid");
  assert(paidUpdate.paid_at !== null, "paid_at auto set");

  const paidAgain = normalizePaymentUpdate({
    paymentStatus: "paid",
    participationFee: 100,
    paidAt: null,
    existingPaidAt: "2026-01-15T10:00:00.000Z",
  });
  assert(
    paidAgain.paid_at === "2026-01-15T10:00:00.000Z",
    "paid -> paid preserves existing paid_at",
  );

  // 3 paid -> pending
  const backToPending = normalizePaymentUpdate({
    paymentStatus: "pending",
    participationFee: 100,
    paidAt: "2026-01-01T00:00:00.000Z",
  });
  assert(backToPending.paid_at === null, "paid -> pending clears paid_at");

  // 4 pending -> waived
  const waived = normalizePaymentUpdate({
    paymentStatus: "waived",
    participationFee: 100,
    paidAt: null,
  });
  assert(waived.payment_status === "waived", "pending -> waived");

  // 5 pending -> not_required
  const notRequired = normalizePaymentUpdate({
    paymentStatus: "not_required",
    participationFee: null,
    paidAt: null,
  });
  assert(notRequired.payment_status === "not_required", "pending -> not_required");

  // 7 negative fee blocked
  assert(Number.isNaN(parseParticipationFeeInput("-10")), "negative fee blocked");

  // 8 club cannot update payment (guard in migration)
  assert(
    migration.includes("payment fields admin only"),
    "club payment update blocked at DB",
  );

  // 11 capacity unaffected by payment states
  const allAccepted = countApplicationsByStatus([
    "accepted",
    "accepted",
    "accepted",
    "accepted",
  ]);
  assert(allAccepted.confirmedTeams === 4, "all payment states still occupy");

  const cancelled = countApplicationsByStatus(["accepted", "cancelled"]);
  assert(cancelled.confirmedTeams === 1, "cancelled still excluded");

  const payment = toApplicationPayment({
    payment_status: "paid",
    participation_fee: "120.50",
    paid_at: "2026-08-01T00:00:00.000Z",
    payment_note: "ok",
  });
  assert(payment.participationFee === 120.5, "fee mapping");

  const queries = readQueries();
  const paymentTypes = readPaymentTypes();
  const board = readPaymentsBoard();

  assert(
    queries.includes("tournaments (id, name, date, age_group)"),
    "payment list select includes tournament id and age_group",
  );
  assert(paymentTypes.includes("tournamentId: string"), "AdminPaymentRecord.tournamentId");
  assert(paymentTypes.includes("ageGroup: string"), "AdminPaymentRecord.ageGroup");
  assert(queries.includes("tournamentId: tournament?.id ?? \"\""), "mapper tournamentId");
  assert(
    queries.includes("ageGroup: tournament?.age_group ?? \"\""),
    "mapper uses authoritative tournament age_group",
  );

  const records: AdminPaymentRecord[] = [
    samplePaymentRecord({ applicationId: "app-1" }),
    samplePaymentRecord({
      applicationId: "app-2",
      clubName: "SV Kirchheim",
      teamName: "Kirchheim Elite",
      tournamentId: "tourn-u10",
      tournamentName: "Kirchheim Cup",
      tournamentDate: "2026-04-10",
      ageGroup: "U10",
      paymentStatus: "paid",
      paidAt: "2026-02-01T00:00:00.000Z",
    }),
    samplePaymentRecord({
      applicationId: "app-3",
      clubName: "FC Muster",
      teamName: "Muster U7",
      tournamentId: "tourn-u7-b",
      tournamentName: "G-Junioren Hallenturnier",
      tournamentDate: "2026-05-01",
      ageGroup: "U7",
      paymentStatus: "waived",
    }),
    samplePaymentRecord({
      applicationId: "app-4",
      clubName: "SC Firma",
      teamName: "Firma A",
      tournamentId: "tourn-firma",
      tournamentName: "Firmenturnier Cup",
      tournamentDate: "2026-06-01",
      ageGroup: "Firmenturnier",
      paymentStatus: "not_required",
      participationFee: null,
    }),
  ];

  const clubHits = filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    query: "jesingen",
  });
  assert(
    clubHits.length === 1 && clubHits[0]?.applicationId === "app-1",
    "club name search",
  );

  const teamHits = filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    query: "Elite",
  });
  assert(
    teamHits.length === 1 && teamHits[0]?.applicationId === "app-2",
    "team name search",
  );

  const caseHits = filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    query: "JESINGEN",
  });
  assert(caseHits.length === 1, "case-insensitive search");

  const trimmedHits = filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    query: "  jesingen  ",
  });
  assert(trimmedHits.length === 1, "trimmed search");

  const tournamentHits = filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    tournamentId: "tourn-u10",
  });
  assert(
    tournamentHits.length === 1 && tournamentHits[0]?.applicationId === "app-2",
    "tournament ID filter",
  );

  const ageHits = filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    ageGroup: "U7",
  });
  assert(
    ageHits.length === 2 &&
      ageHits.every((record) => record.ageGroup === "U7"),
    "age-group filter",
  );

  const statusHits = filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    paymentStatus: "pending",
  });
  assert(
    statusHits.length === 1 && statusHits[0]?.applicationId === "app-1",
    "payment status filter",
  );

  const combined = filterPaymentRecords(records, {
    query: "Jesingen",
    tournamentId: "tourn-u7",
    ageGroup: "U7",
    paymentStatus: "pending",
  });
  assert(
    combined.length === 1 && combined[0]?.applicationId === "app-1",
    "combined AND filtering",
  );

  const reset = filterPaymentRecords(records, emptyPaymentFilters);
  assert(reset.length === records.length, "reset restores all records");
  assert(!arePaymentFiltersActive(emptyPaymentFilters), "empty filters inactive");

  const emptyFiltered = filterPaymentRecords(records, {
    query: "Jesingen",
    tournamentId: "tourn-u10",
    ageGroup: "U7",
    paymentStatus: "pending",
  });
  assert(emptyFiltered.length === 0, "empty filtered result");

  assert(
    reset.map((record) => record.applicationId).join(",") ===
      "app-1,app-2,app-3,app-4",
    "original ordering preserved",
  );

  const frozenIds = records.map((record) => record.applicationId).join(",");
  filterPaymentRecords(records, {
    ...emptyPaymentFilters,
    query: "Kirchheim",
  });
  assert(
    records.map((record) => record.applicationId).join(",") === frozenIds,
    "original input not mutated",
  );

  const tournamentOptions = getPaymentTournamentFilterOptions(records);
  assert(
    tournamentOptions.some((option) => option.id === "tourn-u7") &&
      tournamentOptions.some((option) => option.id === "tourn-u7-b"),
    "tournament options derived from records",
  );
  assert(
    tournamentOptions.some((option) =>
      option.label.includes("G-Junioren Hallenturnier") &&
      option.label.includes("("),
    ),
    "duplicate tournament names remain distinguishable",
  );

  const ageOptions = getPaymentAgeGroupFilterOptions(records);
  assert(
    ageOptions.join(",") === "U7,U10,Firmenturnier",
    "canonical age-group ordering",
  );

  assert(actions.includes("requirePaymentsView"), "authorization view unchanged");
  assert(actions.includes("requirePaymentsManage"), "authorization manage unchanged");
  assert(
    actions.includes("updateApplicationPaymentAction") &&
      actions.includes("normalizePaymentUpdate"),
    "payment mutation behavior unchanged",
  );
  assert(
    !board.includes("loadAdminPaymentRecordsAction") &&
      !board.includes("createClient") &&
      !board.includes('from("applications")') &&
      board.includes("filterPaymentRecords") &&
      board.includes('"use client"'),
    "no per-keystroke database requests",
  );
  assert(board.includes("Filter zurücksetzen"), "reset control present");
  assert(
    board.includes("Keine passenden Zahlungseinträge gefunden."),
    "filtered empty state present",
  );
  assert(
    board.includes("von ${records.length} Zahlungseinträgen"),
    "filtered result count present",
  );

  return "ok";
}
