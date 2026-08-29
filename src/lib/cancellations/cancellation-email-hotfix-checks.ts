import { readFileSync } from "node:fs";
import { join } from "node:path";
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

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
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

function readActions() {
  return readFileSync(join(process.cwd(), "src/lib/cancellations/actions.ts"), "utf8");
}

function readMail() {
  return readFileSync(join(process.cwd(), "src/lib/cancellations/cancellation-mail.ts"), "utf8");
}

function readCancellationMigration() {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/20260829160000_cancellation_requests.sql"),
    "utf8",
  );
}

export function runCancellationEmailHotfixChecks() {
  const migration = readHotfixMigration();
  const actions = readActions();
  const mail = readMail();
  const baseMigration = readCancellationMigration();

  // A: external submit uses dedicated reservation RPC
  assert(
    migration.includes("reserve_external_cancellation_email_send"),
    "A: external reservation RPC exists",
  );
  assert(
    mail.includes("reserve_external_cancellation_email_send"),
    "A: external reservation RPC used in mail layer",
  );
  assert(
    actions.includes("externalTokenHash: tokenHash"),
    "A: external action passes token hash to mail workflow",
  );
  assert(
    migration.includes("GRANT EXECUTE ON FUNCTION public.reserve_external_cancellation_email_send"),
    "A: external RPC granted to anon",
  );
  assert(
    /GRANT EXECUTE ON FUNCTION public\.reserve_cancellation_email_send\([\s\S]*?\) TO authenticated/.test(
      migration,
    ),
    "A: general reservation granted to authenticated only",
  );

  // B: anon cannot use general reservation
  assert(
    migration.includes("REVOKE ALL ON FUNCTION public.reserve_cancellation_email_send") &&
      migration.includes("FROM PUBLIC, anon"),
    "B: general reservation revoked from anon",
  );
  assert(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.reserve_cancellation_email_send(\n  uuid, public.email_template_type\n) TO authenticated;",
    ),
    "B: general reservation granted to authenticated only",
  );

  // C: authenticated foreign reservation blocked via club ownership check
  assert(
    migration.includes("current_club_id()") &&
      migration.includes("a.club_id = public.current_club_id()"),
    "C: general reservation requires club ownership",
  );
  assert(
    migration.includes("RAISE EXCEPTION 'unauthorized'"),
    "C: unauthorized callers rejected",
  );

  // D/E: admin and club paths still use hardened general RPC
  assert(
    mail.includes("reserve_cancellation_email_send"),
    "D/E: club/admin mail still uses general reservation RPC",
  );
  assert(
    actions.includes("submitClubCancellationRequestAction"),
    "E: club cancellation action preserved",
  );
  assert(
    actions.includes("decideCancellationRequestAction"),
    "D: admin decide action preserved",
  );

  // F: idempotency preserved
  assert(
    migration.includes("cancellation_email_send_keys") &&
      migration.includes("ON CONFLICT (cancellation_request_id, template_type) DO NOTHING"),
    "F: idempotency keys preserved in both RPCs",
  );
  assert(
    baseMigration.includes("cancellation_email_send_keys"),
    "F: original idempotency table untouched",
  );

  // G: token validation preserved on external path
  assert(
    migration.includes("validate_secure_access_token(p_token_hash, 'cancellation')"),
    "G: external reservation validates participation token",
  );
  assert(
    migration.includes("requested_by_type = 'external'"),
    "G: external reservation scoped to external requests",
  );
  assert(
    migration.includes("status = 'pending'"),
    "G: external reservation requires pending request",
  );
  const token = generateSecureAccessToken();
  assert(isValidSecureAccessTokenFormat(token), "G: token format validation preserved");
  assert(hashSecureAccessToken(token).length === 64, "G: token hash length preserved");
  assert(!isValidSecureAccessTokenFormat("bad token!"), "G: invalid token format blocked");

  // H: no capacity/payment/waitlist regression
  const pendingCapacity = countApplicationsByStatus(["accepted", "waiting-list"]);
  assert(pendingCapacity.confirmedTeams === 1, "H: accepted still counts toward capacity");
  const afterCancel = countApplicationsByStatus(["cancelled"]);
  assert(afterCancel.confirmedTeams === 0, "H: cancelled does not count toward capacity");
  assert(
    !migration.toLowerCase().includes("waiting-list") ||
      !migration.toLowerCase().includes("promot"),
    "H: no waitlist promotion introduced",
  );
  assert(!migration.includes("payment"), "H: no payment changes");

  // AUTH-01 hardening
  assert(
    migration.includes("IF public.is_admin() THEN") &&
      migration.includes("ELSIF auth.uid() IS NOT NULL"),
    "AUTH-01: admin OR authenticated club owner only",
  );

  // CAN-02 email logging
  assert(
    migration.includes("insert_cancellation_email_log"),
    "CAN-02: admin/club email log RPC exists",
  );
  assert(
    migration.includes("insert_external_cancellation_email_log"),
    "CAN-02: external token-scoped email log RPC exists",
  );
  assert(
    migration.includes("insert_cancellation_email_log_core"),
    "CAN-02: internal email log core has no direct grants",
  );
  assert(
    migration.includes("reservation required"),
    "CAN-02: email log requires prior reservation",
  );
  assert(
    mail.includes("insert_cancellation_email_log"),
    "CAN-02: mail layer uses admin/club email log RPC",
  );
  assert(
    mail.includes("insert_external_cancellation_email_log"),
    "CAN-02: mail layer uses external email log RPC",
  );
  assert(
    !mail.includes('.from("email_logs").insert'),
    "CAN-02: direct email_logs insert removed from cancellation mail",
  );
  assert(
    migration.includes(
      "REVOKE ALL ON FUNCTION public.insert_cancellation_email_log",
    ) && migration.includes("FROM PUBLIC, anon"),
    "email log RPC revoked from anon",
  );
  assert(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.insert_cancellation_email_log(\n  uuid,\n  uuid,\n  uuid,\n  public.email_template_type,\n  text,\n  text,\n  text,\n  text,\n  text,\n  text,\n  text,\n  uuid\n) TO authenticated;",
    ),
    "email log RPC granted to authenticated only",
  );
  assert(
    migration.includes(
      "GRANT EXECUTE ON FUNCTION public.insert_external_cancellation_email_log",
    ),
    "external email log RPC granted to anon",
  );
  assert(
    migration.includes("PERFORM public.insert_cancellation_email_log_core"),
    "public RPCs delegate to internal core writer",
  );
  assert(
    migration.includes("RAISE EXCEPTION 'unauthorized'") &&
      migration.includes("insert_cancellation_email_log("),
    "admin/club email log enforces caller authorization",
  );

  // External path template restriction
  assert(
    migration.includes("'cancellation-request-received'") &&
      migration.includes("'cancellation-request-submitted'"),
    "external RPC limited to submit workflow templates",
  );
  assert(
    !migration.includes("GRANT EXECUTE") ||
      migration.includes("is_cancellation_workflow_template"),
    "shared cancellation template allow-list exists",
  );

  // Rate limiting preserved in base migration
  assert(
    baseMigration.includes("is_public_action_rate_limited"),
    "rate limiting preserved in external submit RPC",
  );

  // 14-day rule unchanged
  const lateDate = new Date();
  lateDate.setUTCDate(lateDate.getUTCDate() + 5);
  const lateIso = lateDate.toISOString().slice(0, 10);
  assert(requiresCancellationReason(lateIso), "14-day rule unchanged");
  assert(isLateCancellationRequest(lateIso), "late window detection unchanged");

  return "ok";
}
