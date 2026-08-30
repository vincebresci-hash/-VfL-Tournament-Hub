import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isStatusEmailReservationError,
  parseStatusEmailReservation,
  parseStatusEmailReservationV2,
  resolveStatusEmailSendDecision,
  shouldReleaseStatusEmailReservation,
  shouldSkipStatusEmailAfterReservation,
  simulateStatusEmailFlow,
  STATUS_EMAIL_IDEMPOTENCY_SCENARIOS,
  STATUS_EMAIL_IDEMPOTENCY_UNAVAILABLE_ERROR,
  type StatusEmailScenario,
} from "@/lib/email/status-mail-idempotency";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runScenario(scenario: StatusEmailScenario, applicationId: string) {
  const result = simulateStatusEmailFlow(scenario, applicationId);

  assert(
    result.action === scenario.expectedAction,
    `${scenario.id}: expected action ${scenario.expectedAction}, got ${result.action}`,
  );
  assert(
    result.release === scenario.expectedRelease,
    `${scenario.id}: expected release ${scenario.expectedRelease}, got ${result.release}`,
  );
}

export function runStatusEmailIdempotencySelfChecks() {
  assert(
    shouldSkipStatusEmailAfterReservation("skip"),
    "skip reservation must skip send",
  );
  assert(
    !shouldSkipStatusEmailAfterReservation("send"),
    "send reservation must allow send",
  );
  assert(
    parseStatusEmailReservation("send") === "send",
    "parseStatusEmailReservation must accept send",
  );
  assert(
    parseStatusEmailReservation("skip") === "skip",
    "parseStatusEmailReservation must accept skip",
  );
  assert(
    parseStatusEmailReservation("invalid") === null,
    "parseStatusEmailReservation must reject unknown values",
  );
  assert(
    shouldReleaseStatusEmailReservation({ sendOk: false, logStatus: "failed" }),
    "failed send must release reservation",
  );
  assert(
    shouldReleaseStatusEmailReservation({ sendOk: false, logStatus: "skipped" }),
    "skipped provider must release reservation",
  );
  assert(
    !shouldReleaseStatusEmailReservation({ sendOk: true, logStatus: "sent" }),
    "successful sent must keep reservation",
  );
  assert(
    !shouldReleaseStatusEmailReservation({
      sendOk: true,
      logStatus: "failed",
      claimed: true,
    }),
    "claimed successful resend must keep reservation even if logging fails",
  );

  assert(
    isStatusEmailReservationError("error"),
    "error reservation must be detectable",
  );
  assert(
    resolveStatusEmailSendDecision("error").action === "fail_closed",
    "error reservation must fail closed",
  );
  assert(
    resolveStatusEmailSendDecision("error").error ===
      STATUS_EMAIL_IDEMPOTENCY_UNAVAILABLE_ERROR,
    "error reservation must return idempotency unavailable message",
  );

  const statusMailSource = readFileSync(
    join(process.cwd(), "src/lib/email/status-mail.ts"),
    "utf8",
  );
  assert(
    !/isMissingRelationError\(error\)[\s\S]{0,200}?return "send"/.test(
      statusMailSource,
    ),
    "status-mail must not fall back to send when migration/RPC is missing",
  );
  assert(
    statusMailSource.includes("finally") &&
      statusMailSource.includes("releaseStatusEmailSend"),
    "status-mail must release reservations in finally on failure",
  );
  assert(
    !statusMailSource.includes("resolveStatusEmailReservationWithRecovery"),
    "status-mail must not use client-side skip recovery",
  );
  assert(
    parseStatusEmailReservationV2({ decision: "send", reservation_id: "id-1" }) !==
      null,
    "status-mail v2 reservation parser available",
  );

  const participationTokenSource = readFileSync(
    join(process.cwd(), "src/lib/cancellations/participation-token.ts"),
    "utf8",
  );
  assert(
    participationTokenSource.includes("getEmailSiteUrl"),
    "participation links must use canonical email site url",
  );

  const applicationsActionsSource = readFileSync(
    join(process.cwd(), "src/lib/applications/actions.ts"),
    "utf8",
  );
  assert(
    applicationsActionsSource.includes("sendApplicationReceivedEmail failed"),
    "public application submit must not fail when received email throws",
  );

  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260827200000_status_email_idempotency.sql",
    ),
    "utf8",
  );
  const hardeningMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831220000_rbac_security_definer_hardening.sql",
    ),
    "utf8",
  );
  assert(
    migration.includes("status_email_send_keys"),
    "migration must create status_email_send_keys",
  );
  assert(
    migration.includes("reserve_application_status_email_send"),
    "migration must define reserve RPC",
  );
  assert(
    migration.includes("release_application_status_email_send"),
    "migration must define release RPC",
  );
  assert(
    migration.includes("email_logs_sent_status_idempotency_idx"),
    "migration must add partial unique index on sent logs",
  );
  assert(
    migration.includes("ON CONFLICT (application_id, template_type) DO NOTHING"),
    "reserve must use atomic insert for race protection",
  );
  assert(
    hardeningMigration.includes("applications.decide") &&
      hardeningMigration.includes("applications.manage") &&
      !hardeningMigration.includes("is_admin()"),
    "status email RPC guards use application permissions",
  );

  const scenarioMap = Object.fromEntries(
    STATUS_EMAIL_IDEMPOTENCY_SCENARIOS.map((scenario) => [scenario.id, scenario]),
  );

  runScenario(scenarioMap.A, "app-a");
  runScenario(scenarioMap.B, "app-a");
  runScenario(scenarioMap.C, "app-a");

  const dFailed: StatusEmailScenario = {
    id: "D-failed",
    priorSentTemplates: [],
    reservationKeys: [],
    targetTemplate: "application-accepted",
    reserveResult: "send",
    sendOk: false,
    logStatus: "failed",
    expectedAction: "send",
    expectedRelease: true,
  };
  const dRetry: StatusEmailScenario = {
    id: "D-retry",
    priorSentTemplates: [],
    reservationKeys: [],
    targetTemplate: "application-accepted",
    reserveResult: "send",
    sendOk: true,
    logStatus: "sent",
    expectedAction: "send",
    expectedRelease: false,
  };
  runScenario(dFailed, "app-d");
  runScenario(dRetry, "app-d");

  runScenario(scenarioMap["E-first"], "app-e");
  runScenario(scenarioMap["E-second"], "app-e");

  const scenarioF: StatusEmailScenario = {
    id: "F",
    priorSentTemplates: [],
    reservationKeys: [],
    targetTemplate: "application-accepted",
    reserveResult: "send",
    sendOk: true,
    logStatus: "sent",
    expectedAction: "send",
    expectedRelease: false,
  };
  runScenario(scenarioF, "app-f-other");

  const scenarioG: StatusEmailScenario = {
    id: "G",
    priorSentTemplates: [],
    reservationKeys: [],
    targetTemplate: "application-accepted",
    reserveResult: "error",
    sendOk: false,
    logStatus: "failed",
    expectedAction: "fail_closed",
    expectedRelease: false,
  };
  runScenario(scenarioG, "app-g");

  return "ok";
}
