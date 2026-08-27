import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseStatusEmailReservation,
  shouldReleaseStatusEmailReservation,
  shouldSkipStatusEmailAfterReservation,
  simulateStatusEmailFlow,
  STATUS_EMAIL_IDEMPOTENCY_SCENARIOS,
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

  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260827200000_status_email_idempotency.sql",
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

  return "ok";
}
