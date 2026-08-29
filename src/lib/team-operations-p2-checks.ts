import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
} from "@/lib/cancellations/tokens";
import {
  isManualAdminApplicationStatus,
  MANUAL_ADMIN_APPLICATION_STATUSES,
} from "@/types/application";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831150000_team_operations_p2_cleanup.sql"),
    "utf8",
  );
}

function readHotfixMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831140000_external_cancellation_email_hotfix.sql",
    ),
    "utf8",
  );
}

function readAdminActions() {
  return readFileSync(join(process.cwd(), "src/lib/db/admin-actions.ts"), "utf8");
}

function readQueries() {
  return readFileSync(join(process.cwd(), "src/lib/db/queries.ts"), "utf8");
}

function readParticipationToken() {
  return readFileSync(
    join(process.cwd(), "src/lib/cancellations/participation-token.ts"),
    "utf8",
  );
}

function readStatusMail() {
  return readFileSync(join(process.cwd(), "src/lib/email/status-mail.ts"), "utf8");
}

function readPaymentActions() {
  return readFileSync(join(process.cwd(), "src/lib/payments/actions.ts"), "utf8");
}

function readMappers() {
  return readFileSync(join(process.cwd(), "src/lib/db/mappers.ts"), "utf8");
}

export function runTeamOperationsP2Checks() {
  const migration = readMigration();
  const hotfixMigration = readHotfixMigration();
  const adminActions = readAdminActions();
  const queries = readQueries();
  const participationToken = readParticipationToken();
  const statusMail = readStatusMail();
  const paymentActions = readPaymentActions();
  const mappers = readMappers();

  // APP-01
  assert(
    adminActions.includes("isManualAdminApplicationStatus(status)"),
    "APP-01: server blocks manual cancelled status",
  );
  assert(
    adminActions.includes("Absagen erfolgt ausschließlich über den Absage-Workflow"),
    "APP-01: user-facing cancelled guard message",
  );
  assert(
    !MANUAL_ADMIN_APPLICATION_STATUSES.includes("cancelled" as never),
    "APP-01: cancelled excluded from manual admin statuses",
  );
  assert(
    isManualAdminApplicationStatus("accepted"),
    "APP-01: accepted remains manual admin status",
  );
  assert(!isManualAdminApplicationStatus("cancelled"), "APP-01: cancelled not manual");

  // PAY-01
  assert(
    migration.includes("application_payment_admin_notes"),
    "PAY-01: admin-only payment notes table",
  );
  assert(
    migration.includes("DROP COLUMN IF EXISTS payment_note"),
    "PAY-01: payment_note removed from applications",
  );
  assert(
    migration.includes("public.is_admin()"),
    "PAY-01: admin-only RLS on payment notes",
  );
  assert(
    queries.includes("application_payment_admin_notes"),
    "PAY-01: admin queries load payment notes separately",
  );
  assert(
    !queries.includes("payment_note") ||
      queries.includes("application_payment_admin_notes"),
    "PAY-01: club select avoids payment_note column",
  );
  assert(
    mappers.includes("paymentNote: null"),
    "PAY-01: club mapper never exposes payment note",
  );
  assert(
    paymentActions.includes("application_payment_admin_notes"),
    "PAY-01: admin payment action writes admin notes table",
  );
  const normalize = readFileSync(
    join(process.cwd(), "src/lib/payments/normalize.ts"),
    "utf8",
  );
  assert(
    paymentActions.includes('.from("applications")\n    .update(update)'),
    "PAY-01: applications table stores payment status fields only",
  );
  assert(
    !normalize.includes("payment_note"),
    "PAY-01: payment field normalizer does not include payment_note",
  );

  // CAN-03
  assert(
    participationToken.includes("revokeActiveParticipationTokens"),
    "CAN-03: active tokens revoked before reissue",
  );
  assert(
    participationToken.includes("issueParticipationCancellationToken"),
    "CAN-03: shared secure token issuance",
  );
  assert(
    participationToken.includes("hashSecureAccessToken(token)"),
    "CAN-03: only token hash stored",
  );
  assert(
    !participationToken.includes("token_hash") ||
      !participationToken.includes("buildParticipationUrl(tokenHash)"),
    "CAN-03: hash is not used as URL token",
  );
  assert(
    statusMail.includes("Teilnahme-Link konnte nicht erstellt werden"),
    "CAN-03: acceptance mail blocked without participation URL",
  );
  assert(
    statusMail.includes("releaseStatusEmailSend"),
    "CAN-03: reservation released when acceptance mail blocked",
  );

  const token = generateSecureAccessToken();
  const hash = hashSecureAccessToken(token);
  assert(hash.length === 64, "CAN-03: sha256 hash length");
  assert(!hash.includes(token), "CAN-03: plaintext token not stored as hash");

  // PR24 findings remain closed
  assert(
    hotfixMigration.includes("reserve_external_cancellation_email_send"),
    "FLOW-02/AUTH-01: external reservation RPC still present",
  );
  assert(
    !hotfixMigration.includes("insert_cancellation_email_log"),
    "CAN-02: client logging RPCs remain absent",
  );

  // Regression helpers
  const pendingCapacity = countApplicationsByStatus(["accepted", "waiting-list"]);
  assert(pendingCapacity.confirmedTeams === 1, "capacity: accepted counts");
  const afterCancel = countApplicationsByStatus(["cancelled"]);
  assert(afterCancel.confirmedTeams === 0, "capacity: cancelled excluded");

  return "ok";
}
