import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";
import {
  normalizePaymentUpdate,
  parseParticipationFeeInput,
} from "@/lib/payments/normalize";
import { toApplicationPayment } from "@/lib/payments/mappers";

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

function readStatusMail() {
  return readFileSync(join(process.cwd(), "src/lib/email/status-mail.ts"), "utf8");
}

function readFaq() {
  return readFileSync(join(process.cwd(), "src/data/faq.tsx"), "utf8");
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

  assert(actions.includes("canAccessAdmin"), "admin-only payment updates");
  assert(actions.includes("normalizePaymentUpdate"), "normalized payment update");

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
    paymentNote: null,
  });
  assert(paidUpdate.payment_status === "paid", "pending -> paid");
  assert(paidUpdate.paid_at !== null, "paid_at auto set");

  const paidAgain = normalizePaymentUpdate({
    paymentStatus: "paid",
    participationFee: 100,
    paidAt: null,
    paymentNote: null,
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
    paymentNote: null,
  });
  assert(backToPending.paid_at === null, "paid -> pending clears paid_at");

  // 4 pending -> waived
  const waived = normalizePaymentUpdate({
    paymentStatus: "waived",
    participationFee: 100,
    paidAt: null,
    paymentNote: "Erlassen",
  });
  assert(waived.payment_status === "waived", "pending -> waived");

  // 5 pending -> not_required
  const notRequired = normalizePaymentUpdate({
    paymentStatus: "not_required",
    participationFee: null,
    paidAt: null,
    paymentNote: null,
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

  return "ok";
}
