import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateCommunicationSendOutcome } from "@/lib/communications/send-outcome";
import { communicationReceiptTokenExpiresAt } from "@/lib/communications/communication-receipt-token";

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

function readRbacMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260831210000_rbac_domain_rls_enforcement.sql"),
    "utf8",
  );
}

export function runCommunicationSendOutcomeChecks() {
  const mail = readMail();
  const actions = readActions();
  const composeForm = readComposeForm();
  const detailPage = readDetailPage();
  const pr42Migration = readPr42Migration();
  const rbacMigration = readRbacMigration();

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

  // Receipt token expiry for past tournaments
  const pastExpiry = communicationReceiptTokenExpiresAt("2020-01-01", new Date("2026-09-01T00:00:00Z"));
  assert(
    new Date(pastExpiry).getTime() > new Date("2026-09-01T00:00:00Z").getTime(),
    "past tournament date still yields future token expiry",
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
    mail.includes("issue_communication_confirmation_token"),
    "confirmation-required communication reaches token issuance",
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

  // PR42 migration: receipt token clamp + view RLS
  assert(
    pr42Migration.includes("v_expires_at := now() + interval '90 days'"),
    "RPC clamps invalid/past expiry instead of rejecting",
  );
  assert(
    !pr42Migration.includes("RAISE EXCEPTION 'invalid expiry'"),
    "RPC no longer rejects past expiry",
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
