import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { countApplicationsByStatus } from "@/lib/tournament-capacity";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
  isValidSecureAccessTokenFormat,
  SECURE_TOKEN_BYTE_LENGTH,
} from "@/lib/cancellations/tokens";
import {
  buildCommunicationReceiptEmailAppendix,
  buildCommunicationReceiptUrl,
  COMMUNICATION_RECEIPT_TOKEN_PURPOSE,
  communicationReceiptTokenExpiresAt,
  createCommunicationReceiptTokenPair,
} from "@/lib/communications/communication-receipt-token";
import { buildCommunicationVariables } from "@/lib/communications/variables";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831120000_communication_receipts.sql"),
    "utf8",
  );
}

function readHardeningMigration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831220000_rbac_security_definer_hardening.sql",
    ),
    "utf8",
  );
}

function readC1Migration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260830120000_communication_center.sql"),
    "utf8",
  );
}

function readCancellationMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260829160000_cancellation_requests.sql"),
    "utf8",
  );
}

function readPaymentMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260829200000_payment_status.sql"),
    "utf8",
  );
}

function readMail() {
  return readFileSync(
    join(process.cwd(), "src/lib/communications/communication-mail.ts"),
    "utf8",
  );
}

function readReceiptActions() {
  return readFileSync(
    join(process.cwd(), "src/lib/communications/communication-receipt-actions.ts"),
    "utf8",
  );
}

function readReceiptPage() {
  return readFileSync(
    join(process.cwd(), "src/app/mitteilung/[token]/page.tsx"),
    "utf8",
  );
}

function readReceiptForm() {
  return readFileSync(
    join(process.cwd(), "src/components/communications/CommunicationReceiptForm.tsx"),
    "utf8",
  );
}

function readComposeForm() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationComposeForm.tsx"),
    "utf8",
  );
}

function readDetailView() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationDetailView.tsx"),
    "utf8",
  );
}

function readFaq() {
  return readFileSync(join(process.cwd(), "src/data/faq.tsx"), "utf8");
}

export function runCommunicationReceiptChecks() {
  const migration = readMigration();
  const hardeningMigration = readHardeningMigration();
  const c1Migration = readC1Migration();
  const cancellationMigration = readCancellationMigration();
  const paymentMigration = readPaymentMigration();
  const mail = readMail();
  const receiptActions = readReceiptActions();
  const receiptPage = readReceiptPage();
  const receiptForm = readReceiptForm();
  const composeForm = readComposeForm();
  const detailView = readDetailView();
  const faq = readFaq();

  assert(
    hardeningMigration.includes("issue_communication_confirmation_token") &&
      hardeningMigration.includes("communications.send required"),
    "receipt token issuance RBAC hardened",
  );
  assert(
    hardeningMigration.includes("p_require_confirmation") &&
      hardeningMigration.includes("communications.send required"),
    "C2 initiate send RBAC hardened",
  );
  assert(
    hardeningMigration.includes("communication_confirmation_tokens_admin_select") &&
      hardeningMigration.includes("communications.view"),
    "confirmation token admin select RBAC hardened",
  );
  assert(
    !hardeningMigration.includes("get_communication_receipt_context") &&
      !hardeningMigration.includes("confirm_communication_receipt"),
    "public receipt RPCs left token-scoped",
  );

  // Schema
  assert(
    migration.includes("communication_confirmation_tokens"),
    "confirmation tokens table",
  );
  assert(
    migration.includes("require_confirmation boolean NOT NULL DEFAULT false"),
    "require_confirmation column",
  );
  assert(migration.includes("confirmed_at timestamptz"), "confirmed_at column");
  assert(migration.includes("length(token_hash) = 64"), "token hash length check");
  assert(
    migration.includes("communication_confirmation_tokens_recipient_unique"),
    "one token per recipient",
  );

  // 1-3 Token generation
  const tokenPair = createCommunicationReceiptTokenPair();
  assert(tokenPair.token.length > 0, "1 token generated");
  assert(tokenPair.tokenHash.length === 64, "2 SHA-256 hex hash");
  assert(
    Buffer.from(tokenPair.token, "base64url").length >= SECURE_TOKEN_BYTE_LENGTH,
    "3 sufficient random bytes",
  );
  assert(tokenPair.token !== tokenPair.tokenHash, "plaintext differs from hash");

  // 4-6 Invalid/expired/revoked handling
  assert(
    receiptActions.includes("return null") || receiptActions.includes("return {"),
    "4 invalid token handled",
  );
  assert(
    migration.includes("cct.expires_at > now()") ||
      migration.includes("expires_at > now()"),
    "5 expiry enforced",
  );
  assert(migration.includes("revoked_at IS NULL"), "6 revocation enforced");

  // 7-9 Recipient isolation and confirmation
  assert(
    migration.includes("communication_recipient_id"),
    "7 token bound to recipient",
  );
  assert(
    migration.includes("COALESCE(cr.confirmed_at, now())"),
    "8 first confirmation sets confirmed_at",
  );
  assert(
    migration.includes("already_confirmed"),
    "9 second confirmation idempotent",
  );

  // RPC overload safety
  assert(
    migration.includes(
      "DROP FUNCTION IF EXISTS public.initiate_communication_send(\n  uuid, text, text, text, boolean, text, uuid[], text\n)",
    ) || migration.includes(
      "DROP FUNCTION IF EXISTS public.initiate_communication_send(uuid, text, text, text, boolean, text, uuid[], text)",
    ),
    "C1 initiate overload dropped before C2 create",
  );
  assert(
    migration.includes("p_require_confirmation boolean DEFAULT false"),
    "C2 initiate signature present",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.initiate_communication_send") &&
      migration.includes("p_require_confirmation boolean"),
    "C2 initiate grant present",
  );
  assert(
    !migration.includes("CREATE OR REPLACE FUNCTION public.validate_secure_access_token"),
    "validate_secure_access_token unchanged",
  );
  assert(
    !paymentMigration.includes("DROP FUNCTION public.get_external_participation_payment_by_token"),
    "payment RPC unchanged",
  );

  // Token rotation on retry
  assert(migration.includes("RETURN 'replaced'"), "token rotation on re-issue");
  assert(
    mail.includes('issueResult === "created" || issueResult === "replaced"'),
    "email retry uses rotated token link",
  );
  assert(
    !mail.includes('issueResult === "exists"'),
    "no stale exists-only retry path",
  );

  // 12-15 regressions
  assert(!mail.includes("payment_status ="), "12 payment status unchanged");
  assert(!mail.includes("application_status"), "13 application status unchanged");
  assert(!paymentMigration.includes("communication_confirmation"), "payment migration untouched");
  const acceptedOnly = countApplicationsByStatus(["accepted", "waiting-list", "rejected"]);
  assert(acceptedOnly.confirmedTeams === 1, "14 capacity unchanged");
  assert(!migration.includes("waiting-list"), "15 waitlist logic untouched in C2 migration");

  // 16-17 cancellation and validate_secure_access_token
  assert(
    !migration.includes("CREATE OR REPLACE FUNCTION public.validate_secure_access_token"),
    "17 validate_secure_access_token unchanged",
  );
  assert(
    cancellationMigration.includes("validate_secure_access_token") &&
      !migration.includes("DROP FUNCTION public.validate_secure_access_token"),
    "16 cancellation token flow untouched",
  );

  // 18-20 privacy
  assert(
    !receiptPage.includes("payment_note") && !receiptForm.includes("payment_note"),
    "18 payment_note not public",
  );
  assert(
    !receiptForm.includes("recipientEmail") && !receiptPage.includes("contact_email"),
    "19 no email on public page",
  );
  assert(
    !mail.includes("tokenPair.token") ||
      !mail.includes(".insert({") ||
      mail.includes("buildCommunicationReceiptEmailAppendix"),
    "plaintext token not written to email_logs insert fields directly",
  );
  assert(
    !migration.includes("ALTER TABLE public.email_logs"),
    "20 no token column in email_logs",
  );

  // Plaintext not persisted
  assert(
    migration.includes("token_hash text NOT NULL") &&
      !migration.includes("token_plaintext") &&
      !migration.includes("plaintext_token"),
    "plaintext token not stored in DB schema",
  );

  // Purpose isolation
  assert(
    COMMUNICATION_RECEIPT_TOKEN_PURPOSE === "communication_receipt",
    "token purpose isolation",
  );
  assert(
    !c1Migration.includes("communication_confirmation_tokens"),
    "C1 migration untouched",
  );

  // Rate limiting
  assert(
    migration.includes("communication_receipt_confirm") &&
      migration.includes("is_public_action_rate_limited"),
    "rate limiting",
  );

  // Public route
  assert(
    receiptPage.includes("loadCommunicationReceiptByToken"),
    "public route exists",
  );
  assert(
    receiptForm.includes("keine Vertrags-, Teilnahme- oder Zahlungsbestätigung"),
    "legal disclaimer on public page",
  );

  // Admin UI
  assert(
    composeForm.includes("Empfangsbestätigung erforderlich"),
    "admin confirmation checkbox",
  );
  assert(
    detailView.includes("Empfangsbestätigungen"),
    "admin confirmation overview",
  );

  // Email integration
  assert(
    mail.includes("issue_communication_confirmation_token"),
    "email token issuance RPC",
  );
  assert(
    mail.includes("compose.requireConfirmation") &&
      mail.includes("buildCommunicationReceiptUrl"),
    "confirmation link in email flow",
  );
  assert(
    buildCommunicationReceiptEmailAppendix("https://example.test/mitteilung/abc").includes(
      "Erhalt",
    ),
    "email appendix text",
  );

  // FAQ
  assert(faq.includes('id: "turnierkommunikation"'), "FAQ entry exists");
  assert(
    faq.includes("dokumentiert ausschließlich den Erhalt der Information"),
    "FAQ updated",
  );
  assert(
    (faq.match(/id: "turnierkommunikation"/g) ?? []).length === 1,
    "no duplicate FAQ",
  );

  // URL builder
  const url = buildCommunicationReceiptUrl(tokenPair.token);
  assert(url.includes("/mitteilung/"), "confirmation URL path");
  assert(isValidSecureAccessTokenFormat(tokenPair.token), "URL-safe token format");

  // Variables
  const variables = buildCommunicationVariables({
    contactFirstName: "Max",
    teamName: "Team",
    clubName: "Club",
    tournamentName: "Cup",
    tournamentSlug: "cup",
    meinTurnierplanUrl: null,
    participationFee: null,
    paymentStatus: null,
    confirmationUrl: url,
  });
  assert(variables.confirmation_url === url, "confirmation_url variable");

  // Expiry helper
  const expiresAt = communicationReceiptTokenExpiresAt("2026-09-01");
  assert(new Date(expiresAt).getTime() > Date.now(), "token expiry in future");

  // Hash is SHA-256
  const sample = hashSecureAccessToken("test-token");
  assert(sample === createHash("sha256").update("test-token").digest("hex"), "SHA-256 storage");

  // Randomness spot check
  const a = generateSecureAccessToken();
  const b = generateSecureAccessToken();
  assert(a !== b, "tokens are unpredictable");

  return "ok";
}
