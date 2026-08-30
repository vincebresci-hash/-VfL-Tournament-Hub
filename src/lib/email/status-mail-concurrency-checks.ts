import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSimulatedStatusEmailStore,
  getCurrentReservationId,
  getCurrentReservationVersion,
  simulateClaimStatusEmailSendV2,
  simulateReleaseStatusEmailSendV1,
  simulateReleaseStatusEmailSendV2,
  simulateReserveStatusEmailSendV1,
  simulateReserveStatusEmailSendV2,
  simulateWriteSentLog,
  STATUS_EMAIL_RESERVATION_LEASE_MS,
  STATUS_EMAIL_RESERVATION_VERSION_V1,
  STATUS_EMAIL_RESERVATION_VERSION_V2,
} from "@/lib/email/status-mail-concurrency";
import {
  parseStatusEmailReservationV2,
  shouldReleaseStatusEmailReservation,
} from "@/lib/email/status-mail-idempotency";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runStatusEmailConcurrencySelfChecks() {
  assert(
    parseStatusEmailReservationV2([{ decision: "send", reservation_id: "abc" }])
      ?.reservationId === "abc",
    "parse v2 send payload from table row array",
  );
  assert(
    parseStatusEmailReservationV2({ decision: "skip", reservation_id: null })?.decision ===
      "skip",
    "parse v2 skip payload",
  );

  // TEST 1 — V1 reserve → version 1; V1 release deletes own V1 reservation
  {
    const store = createSimulatedStatusEmailStore();
    const reserve = simulateReserveStatusEmailSendV1({
      store,
      templateType: "application-accepted",
      nowMs: 0,
    });
    assert(
      getCurrentReservationVersion(store, "application-accepted") ===
        STATUS_EMAIL_RESERVATION_VERSION_V1,
      "TEST 1: V1 reserve creates version 1",
    );
    simulateReleaseStatusEmailSendV1({
      store,
      templateType: "application-accepted",
    });
    assert(
      !store.keys.has("application-accepted"),
      "TEST 1: V1 release deletes own V1 reservation",
    );
    void reserve;
  }

  // TEST 2 — V2 reserve → version 2; V1 release leaves V2 reservation
  {
    const store = createSimulatedStatusEmailStore();
    const reserve = simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: 0,
    });
    assert(
      getCurrentReservationVersion(store, "waiting-list") ===
        STATUS_EMAIL_RESERVATION_VERSION_V2,
      "TEST 2: V2 reserve creates version 2",
    );
    simulateReleaseStatusEmailSendV1({
      store,
      templateType: "waiting-list",
    });
    assert(
      getCurrentReservationId(store, "waiting-list") === reserve.reservationId,
      "TEST 2: V1 release must not delete V2 reservation",
    );
  }

  // TEST 3 — V1 stale; V2 takeover → version 2; late V1 release leaves V2
  {
    const store = createSimulatedStatusEmailStore();
    simulateReserveStatusEmailSendV1({
      store,
      templateType: "application-rejected",
      nowMs: 0,
    });
    const takeover = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-rejected",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 1,
    });
    assert(
      getCurrentReservationVersion(store, "application-rejected") ===
        STATUS_EMAIL_RESERVATION_VERSION_V2,
      "TEST 3: stale takeover upgrades to version 2",
    );
    simulateReleaseStatusEmailSendV1({
      store,
      templateType: "application-rejected",
    });
    assert(
      getCurrentReservationId(store, "application-rejected") === takeover.reservationId,
      "TEST 3: late V1 release must not delete V2 reservation",
    );
  }

  // TEST 4 — V2 A stale; V2 B takeover; late A release(token A) leaves B
  {
    const store = createSimulatedStatusEmailStore();
    const reserveA = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-under-review",
      nowMs: 0,
    });
    const tokenA = reserveA.reservationId!;
    const reserveB = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-under-review",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 1,
    });
    const tokenB = reserveB.reservationId!;
    simulateReleaseStatusEmailSendV2({
      store,
      templateType: "application-under-review",
      reservationId: tokenA,
    });
    assert(
      getCurrentReservationId(store, "application-under-review") === tokenB,
      "TEST 4: old V2 owner release must not delete new V2 lease",
    );
  }

  // TEST 5 — late A claim(token A) → false
  {
    const store = createSimulatedStatusEmailStore();
    const reserveA = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: 0,
    });
    const tokenA = reserveA.reservationId!;
    simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 1,
    });
    const claimed = simulateClaimStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      reservationId: tokenA,
      providerMessageId: "provider-a",
    });
    assert(!claimed, "TEST 5: late old-owner claim must fail");
    assert(
      store.keys.get("application-accepted")?.providerMessageId === null,
      "TEST 5: current lease remains unclaimed",
    );
  }

  // TEST 6 — V2 owner claim → true
  {
    const store = createSimulatedStatusEmailStore();
    const reserveB = simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: 0,
    });
    const tokenB = reserveB.reservationId!;
    const claimed = simulateClaimStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      reservationId: tokenB,
      providerMessageId: "provider-b",
    });
    assert(claimed, "TEST 6: correct V2 owner claim succeeds");
  }

  // TEST 7 — claimed V2; V1 release leaves reservation
  {
    const store = createSimulatedStatusEmailStore();
    const reserve = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-rejected",
      nowMs: 0,
    });
    simulateClaimStatusEmailSendV2({
      store,
      templateType: "application-rejected",
      reservationId: reserve.reservationId!,
      providerMessageId: "provider-claimed",
    });
    simulateReleaseStatusEmailSendV1({
      store,
      templateType: "application-rejected",
    });
    assert(
      getCurrentReservationId(store, "application-rejected") === reserve.reservationId,
      "TEST 7: V1 release must not delete claimed V2 reservation",
    );
  }

  // TEST 8 — sent log blocks resend
  {
    const store = createSimulatedStatusEmailStore();
    simulateWriteSentLog({
      store,
      templateType: "application-accepted",
    });
    const reserve = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: 99_999,
    });
    assert(reserve.decision === "skip", "TEST 8: sent log blocks reserve");
  }

  // Active in-flight lease blocks concurrent reserve
  {
    const store = createSimulatedStatusEmailStore();
    const first = simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: 10_000,
    });
    const second = simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: 10_500,
    });
    assert(first.decision === "send" && second.decision === "skip", "active lease blocks second reserve");
  }

  // Resend success + log failure keeps claimed lease from release
  assert(
    !shouldReleaseStatusEmailReservation({
      sendOk: true,
      logStatus: "failed",
      claimed: true,
    }),
    "claimed successful resend must not release on log failure",
  );

  const statusMailSource = readFileSync(
    join(process.cwd(), "src/lib/email/status-mail.ts"),
    "utf8",
  );
  assert(
    statusMailSource.includes("reserve_application_status_email_send_v2"),
    "status-mail must use v2 reserve RPC",
  );
  assert(
    statusMailSource.includes("claim_application_status_email_send_v2"),
    "status-mail must use v2 claim RPC",
  );
  assert(
    statusMailSource.includes("release_application_status_email_send_v2"),
    "status-mail must use v2 release RPC",
  );
  assert(
    !statusMailSource.includes('rpc("reserve_application_status_email_send"'),
    "status-mail must not call v1 reserve RPC",
  );
  assert(
    !/decision\.action === "skip"[\s\S]{0,120}releaseStatusEmailSend/.test(
      statusMailSource,
    ),
    "status-mail must not release on skip",
  );
  assert(
    statusMailSource.includes("p_reservation_id"),
    "status-mail must pass reservation ownership token",
  );

  const leaseMigration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260831250000_status_email_reservation_lease.sql",
    ),
    "utf8",
  );
  assert(
    leaseMigration.includes("reservation_id"),
    "lease migration adds reservation_id",
  );
  assert(
    leaseMigration.includes("reservation_version"),
    "lease migration adds reservation_version",
  );
  assert(
    leaseMigration.includes("reserve_application_status_email_send_v2"),
    "lease migration defines v2 reserve RPC",
  );
  assert(
    leaseMigration.includes("claim_application_status_email_send_v2"),
    "lease migration defines v2 claim RPC",
  );
  assert(
    leaseMigration.includes("release_application_status_email_send_v2"),
    "lease migration defines v2 release RPC",
  );
  assert(
    !leaseMigration.includes("CREATE OR REPLACE FUNCTION public.reserve_application_status_email_send("),
    "lease migration must not modify v1 reserve RPC",
  );
  assert(
    leaseMigration.includes("CREATE OR REPLACE FUNCTION public.release_application_status_email_send("),
    "lease migration must tighten v1 release RPC",
  );
  assert(
    leaseMigration.includes("reservation_version = 1"),
    "v1 release must only delete version 1 leases",
  );
  assert(
    leaseMigration.includes("RETURNS TABLE(decision text, reservation_id uuid)"),
    "v2 reserve returns decision + reservation_id table",
  );
  assert(
    leaseMigration.includes("reservation_id = p_reservation_id"),
    "v2 claim/release must scope by reservation_id",
  );
  assert(
    leaseMigration.includes("reservation_version = 2"),
    "v2 claim/release/reserve must use version 2",
  );
  assert(
    leaseMigration.includes("interval '10 minutes'"),
    "lease migration defines 10 minute lease",
  );
  assert(
    leaseMigration.includes("SET search_path = public"),
    "lease migration SECURITY DEFINER functions set search_path",
  );
  assert(
    leaseMigration.includes("REVOKE ALL ON FUNCTION public.release_application_status_email_send") &&
      leaseMigration.includes("GRANT EXECUTE ON FUNCTION public.release_application_status_email_send"),
    "lease migration re-applies v1 release grants",
  );

  // TEST 9 — migration compatible with f093eb9 (V1 reserve unchanged, V1 release signature unchanged)
  assert(
    !leaseMigration.includes("CREATE OR REPLACE FUNCTION public.reserve_application_status_email_send("),
    "TEST 9: V1 reserve RPC untouched for f093eb9 compatibility",
  );
  assert(
    leaseMigration.includes(
      "CREATE OR REPLACE FUNCTION public.release_application_status_email_send(\n  p_application_id uuid,\n  p_template_type public.email_template_type\n)",
    ),
    "TEST 9: V1 release keeps original signature",
  );

  // TEST 10 — PR37 code uses V2 exclusively
  assert(
    !statusMailSource.includes('rpc("release_application_status_email_send"'),
    "TEST 10: PR37 status-mail must not call v1 release RPC",
  );
  assert(
    !statusMailSource.includes('rpc("claim_application_status_email_send"'),
    "TEST 10: PR37 status-mail must not call v1 claim RPC",
  );

  return "ok";
}
