import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateCommunicationSendOutcome } from "@/lib/communications/send-outcome";
import {
  COMMUNICATION_RECEIPT_TOKEN_VALIDITY_DAYS,
  communicationReceiptTokenExpiresAt,
  createCommunicationReceiptTokenPair,
} from "@/lib/communications/communication-receipt-token";
import { hashSecureAccessToken } from "@/lib/cancellations/tokens";
import { createHash } from "node:crypto";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readMail() {
  return readFileSync(
    join(process.cwd(), "src/lib/communications/communication-mail.ts"),
    "utf8",
  );
}

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/communications/actions.ts"), "utf8");
}

function readComposeForm() {
  return readFileSync(
    join(process.cwd(), "src/components/admin/CommunicationComposeForm.tsx"),
    "utf8",
  );
}

function readDetailPage() {
  return readFileSync(
    join(process.cwd(), "src/app/admin/kommunikation/[id]/page.tsx"),
    "utf8",
  );
}

function readPr42Migration() {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260901120000_communication_pr42_send_incident_fix.sql",
    ),
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

function readRbacSeedMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831160000_user_profiles_rbac.sql"),
    "utf8",
  );
}

export function runCommunicationSendOutcomeChecks() {
  const mail = readMail();
  const actions = readActions();
  const composeForm = readComposeForm();
  const detailPage = readDetailPage();
  const pr42Migration = readPr42Migration();
  const hardeningMigration = readHardeningMigration();
  const rbacMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20260831210000_rbac_domain_rls_enforcement.sql"),
    "utf8",
  );
  const rbacSeedMigration = readRbacSeedMigration();

  // Send outcome evaluation
  const allFailed = evaluateCommunicationSendOutcome({
    sentCount: 0,
    failedCount: 2,
    skippedCount: 0,
  });
  assert(allFailed.error != null, "all failed is not success");
  assert(allFailed.notice == null, "all failed has no success notice");

  const zeroZero = evaluateCommunicationSendOutcome({
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
  });
  assert(zeroZero.error != null, "0 sent / 0 failed is not success");

  const partial = evaluateCommunicationSendOutcome({
    sentCount: 3,
    failedCount: 1,
    skippedCount: 0,
  });
  assert(partial.error == null, "partial success is not hard error");
  assert(
    Boolean(partial.notice?.includes("3 versendet") && partial.notice?.includes("1 fehlgeschlagen")),
    "partial success reports counts",
  );

  const success = evaluateCommunicationSendOutcome({
    sentCount: 1,
    failedCount: 0,
    skippedCount: 0,
  });
  assert(success.error == null, "successful send has no error");
  assert(Boolean(success.notice?.includes("1 E-Mail versendet")), "successful send reports success");

  const idempotent = evaluateCommunicationSendOutcome({
    sentCount: 0,
    failedCount: 0,
    skippedCount: 3,
  });
  assert(idempotent.error == null, "all skipped idempotent retry is not error");
  assert(
    Boolean(idempotent.notice?.includes("bereits verarbeitet")),
    "idempotent retry reports already processed",
  );

  // Receipt token expiry: future, today, past tournaments
  const now = new Date("2026-09-01T12:00:00Z");
  const futureExpiry = communicationReceiptTokenExpiresAt("2026-12-01", now);
  const todayExpiry = communicationReceiptTokenExpiresAt("2026-09-01", now);
  const pastExpiry = communicationReceiptTokenExpiresAt("2020-01-01", now);

  for (const expiry of [futureExpiry, todayExpiry, pastExpiry]) {
    assert(new Date(expiry).getTime() > now.getTime(), "app always yields future expiry");
  }

  const futureReference = new Date("2026-12-01T00:00:00Z");
  futureReference.setUTCDate(
    futureReference.getUTCDate() + COMMUNICATION_RECEIPT_TOKEN_VALIDITY_DAYS,
  );
  assert(
    new Date(futureExpiry).getTime() === futureReference.getTime(),
    "future tournament expiry",
  );

  const todayReference = new Date("2026-09-01T00:00:00Z");
  todayReference.setUTCDate(
    todayReference.getUTCDate() + COMMUNICATION_RECEIPT_TOKEN_VALIDITY_DAYS,
  );
  assert(
    new Date(todayExpiry).getTime() === todayReference.getTime(),
    "today tournament expiry",
  );
  assert(
    new Date(pastExpiry).getTime() === todayReference.getTime(),
    "past tournament expiry uses today as reference",
  );

  assert(
    hardeningMigration.includes("RAISE EXCEPTION 'invalid expiry'"),
    "RPC still rejects past/invalid expiry",
  );
  assert(
    !pr42Migration.includes("issue_communication_confirmation_token"),
    "PR42 migration does not modify RPC expiry validation",
  );

  const tokenPair = createCommunicationReceiptTokenPair();
  assert(tokenPair.tokenHash.length === 64, "token remains securely hashed");
  assert(
    tokenPair.tokenHash === hashSecureAccessToken(tokenPair.token) &&
      tokenPair.tokenHash === createHash("sha256").update(tokenPair.token).digest("hex"),
    "token hash is SHA-256",
  );

  // Reserve RPC errors must not silently skip
  assert(
    mail.includes('status: "error"') && mail.includes("Versandreservierung fehlgeschlagen"),
    "reserve RPC error is counted as failure",
  );
  assert(
    !mail.includes('if (error) {\n    return "skip"'),
    "reserve RPC error is not silent skip",
  );

  // Send path uses outcome evaluation
  assert(mail.includes("evaluateCommunicationSendOutcome"), "send path evaluates outcome");
  assert(
    mail.includes("compose.requireConfirmation") &&
      mail.includes("issue_communication_confirmation_token") &&
      mail.includes("provider.send"),
    "confirmation mail for past tournament reaches provider",
  );
  assert(
    mail.includes("Bestätigungstoken konnte nicht erstellt werden"),
    "token failure becomes visible failure",
  );
  assert(
    mail.includes("sendResult.ok") && mail.includes("failedCount += 1"),
    "provider failure becomes visible failure",
  );

  // Actions pass through notice/error
  assert(actions.includes("notice: result.notice"), "actions pass through notice");
  assert(
    actions.includes("if (result.error)") && actions.includes("communicationId: result.communicationId"),
    "actions return communicationId on failure for navigation context",
  );

  // UI notice handling
  assert(composeForm.includes("result.notice"), "compose form reads result.notice");
  assert(composeForm.includes('params.set("notice"'), "compose form passes notice on redirect");
  assert(detailPage.includes("searchParams"), "detail page accepts notice query param");
  assert(detailPage.includes("role=\"status\""), "detail page shows notice banner");

  // PR42 migration: view RLS only (no RPC weakening)
  assert(
    !pr42Migration.includes("issue_communication_confirmation_token"),
    "PR42 migration is RLS-only",
  );
  assert(
    pr42Migration.includes("tournament_communications_view_select") &&
      pr42Migration.includes("has_rbac_permission('communications.view')"),
    "communications.view can read tournament_communications",
  );
  assert(
    pr42Migration.includes("communication_recipients_view_select") &&
      pr42Migration.includes("FOR SELECT"),
    "communications.view can read communication_recipients",
  );
  assert(
    !pr42Migration.includes("FOR INSERT") && !pr42Migration.includes("FOR UPDATE"),
    "view migration is SELECT-only",
  );

  const clubAdminBlock =
    rbacSeedMigration.match(/WHERE r\.key = 'CLUB_ADMIN'[\s\S]*?ON CONFLICT DO NOTHING;/)?.[0] ??
    "";
  assert(
    !clubAdminBlock.includes("communications.view") &&
      !clubAdminBlock.includes("communications.send"),
    "club admin has no communications access",
  );
  assert(
    rbacSeedMigration.includes(
      "JOIN public.rbac_permissions p ON p.key IN (\n  'teams.view', 'schedule.view', 'results.view', 'communications.view'\n)\nWHERE r.key = 'TEAM_MANAGER'",
    ),
    "team manager view permission unchanged",
  );
  assert(
    !rbacSeedMigration.includes(
      "JOIN public.rbac_permissions p ON p.key IN (\n  'teams.view', 'schedule.view', 'results.view', 'communications.view', 'communications.send'",
    ),
    "team manager cannot send communications",
  );

  // Manage policies unchanged in prior migration
  assert(
    rbacMigration.includes("tournament_communications_admin_all") &&
      rbacMigration.includes("communications.manage"),
    "communications.manage write policy preserved",
  );
  assert(
    rbacMigration.includes("communications.send required"),
    "communications.send remains required for send RPCs",
  );

  return "ok";
}
