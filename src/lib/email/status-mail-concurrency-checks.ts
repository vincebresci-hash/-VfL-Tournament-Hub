import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSimulatedStatusEmailStore,
  simulateConcurrentStatusEmailSends,
  simulateReleaseStatusEmailSend,
  simulateReserveStatusEmailSendWithLease,
  STATUS_EMAIL_RESERVATION_LEASE_MS,
} from "@/lib/email/status-mail-concurrency";
import { shouldReleaseStatusEmailReservation } from "@/lib/email/status-mail-idempotency";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runStatusEmailConcurrencySelfChecks() {
  // A) Two parallel reservations → at most one sender
  {
    const store = createSimulatedStatusEmailStore();
    const result = simulateConcurrentStatusEmailSends({
      store,
      templateType: "application-accepted",
      startMs: 1_000,
      requestBDelayMs: 5,
      requestASendCompletesMs: 50,
    });
    assert(result.requestA.reserved, "A: first request reserves");
    assert(!result.requestB.reserved, "A: second concurrent request must not reserve");
    assert(result.totalSends === 1, "A: only one real send allowed");
  }

  // B) Active in-flight key must not be taken over before lease expiry
  {
    const store = createSimulatedStatusEmailStore();
    const first = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "waiting-list",
      nowMs: 10_000,
    });
    const second = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "waiting-list",
      nowMs: 10_500,
    });
    assert(first === "send" && second === "skip", "B: active key blocks second reserve");
    assert(store.keys.size === 1, "B: in-flight key still held");
    assert(
      store.keys.get("waiting-list")!.providerMessageId === null,
      "B: in-flight key remains unclaimed",
    );
  }

  // C) Stale orphaned key becomes recoverable only after lease TTL
  {
    const store = createSimulatedStatusEmailStore();
    simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-rejected",
      nowMs: 0,
    });
    const beforeLease = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-rejected",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS - 1,
    });
    assert(beforeLease === "skip", "C: fresh orphan remains in-flight");
    const afterLease = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-rejected",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 1,
    });
    assert(afterLease === "send", "C: stale orphan can be atomically recovered");
  }

  // D) Sent log present → never resend
  {
    const store = createSimulatedStatusEmailStore();
    store.sentLogs.add("application-under-review");
    const reserve = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-under-review",
      nowMs: 99_999,
    });
    assert(reserve === "skip", "D: sent log blocks reserve");
  }

  // E) Resend success + logging failure must not enable immediate aggressive resend
  {
    assert(
      !shouldReleaseStatusEmailReservation({
        sendOk: true,
        logStatus: "failed",
        claimed: true,
      }),
      "E: claimed reservation must not be released after log failure",
    );
    const store = createSimulatedStatusEmailStore();
    simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-accepted",
      nowMs: 0,
    });
    store.keys.get("application-accepted")!.providerMessageId = "resend-123";
    const retry = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-accepted",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 5_000,
    });
    assert(retry === "skip", "E: claimed key must not be taken over by stale recovery");
  }

  // F) Renderer exception path releases only owning failed request
  {
    assert(
      shouldReleaseStatusEmailReservation({
        sendOk: false,
        logStatus: "failed",
        claimed: false,
      }),
      "F: failed unclaimed send releases reservation",
    );
  }

  // G) Resend timeout / failure allows retry after release
  {
    const store = createSimulatedStatusEmailStore();
    simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "waiting-list",
      nowMs: 1_000,
    });
    simulateReleaseStatusEmailSend({
      store,
      templateType: "waiting-list",
    });
    const retry = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "waiting-list",
      nowMs: 2_000,
    });
    assert(retry === "send", "G: released failure can reserve again");
  }

  // H) Normal status change → exactly one send
  {
    const store = createSimulatedStatusEmailStore();
    const reserve = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-accepted",
      nowMs: 5_000,
    });
    assert(reserve === "send", "H: normal flow reserves once");
    store.keys.get("application-accepted")!.providerMessageId = "resend-normal";
    store.sentLogs.add("application-accepted");
    const second = simulateReserveStatusEmailSendWithLease({
      store,
      templateType: "application-accepted",
      nowMs: 6_000,
    });
    assert(second === "skip", "H: subsequent reserve is blocked after sent log");
  }

  const statusMailSource = readFileSync(
    join(process.cwd(), "src/lib/email/status-mail.ts"),
    "utf8",
  );
  assert(
    !statusMailSource.includes("resolveStatusEmailReservationWithRecovery"),
    "status-mail must not use client-side skip release/recovery",
  );
  assert(
    !/decision\.action === "skip"[\s\S]{0,120}releaseStatusEmailSend/.test(
      statusMailSource,
    ),
    "status-mail must not release on skip",
  );
  assert(
    statusMailSource.includes("claim_application_status_email_send"),
    "status-mail must claim reservation after successful resend",
  );
  assert(
    statusMailSource.includes("ownsReservation"),
    "status-mail must only release keys owned by this request",
  );

  const leaseMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831250000_status_email_reservation_lease.sql",
    ),
    "utf8",
  );
  assert(
    leaseMigration.includes("provider_message_id"),
    "lease migration adds provider_message_id",
  );
  assert(
    leaseMigration.includes("claim_application_status_email_send"),
    "lease migration defines claim RPC",
  );
  assert(
    leaseMigration.includes("interval '10 minutes'"),
    "lease migration defines 10 minute lease",
  );
  assert(
    leaseMigration.includes("created_at < v_stale_threshold"),
    "lease migration uses created_at stale detection",
  );
  assert(
    leaseMigration.includes("applications.decide"),
    "lease migration preserves RBAC guards",
  );

  return "ok";
}
