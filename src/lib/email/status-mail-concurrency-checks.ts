import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSimulatedStatusEmailStore,
  getCurrentReservationId,
  simulateClaimStatusEmailSendV2,
  simulateReleaseStatusEmailSendV2,
  simulateReserveStatusEmailSendV2,
  simulateWriteSentLog,
  STATUS_EMAIL_RESERVATION_LEASE_MS,
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
    parseStatusEmailReservationV2({ decision: "send", reservation_id: "abc" })
      ?.reservationId === "abc",
    "parse v2 send payload",
  );
  assert(
    parseStatusEmailReservationV2({ decision: "skip", reservation_id: null })?.decision ===
      "skip",
    "parse v2 skip payload",
  );

  // TEST 1 — Old Owner Release
  {
    const store = createSimulatedStatusEmailStore();
    const reserveA = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: 0,
    });
    const tokenA = reserveA.reservationId!;
    const reserveB = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 1,
    });
    const tokenB = reserveB.reservationId!;
    simulateReleaseStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      reservationId: tokenA,
    });
    assert(
      getCurrentReservationId(store, "application-accepted") === tokenB,
      "TEST 1: old owner release must not delete new lease",
    );
  }

  // TEST 2 — Old Owner Claim
  {
    const store = createSimulatedStatusEmailStore();
    const reserveA = simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: 0,
    });
    const tokenA = reserveA.reservationId!;
    simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 1,
    });
    const claimed = simulateClaimStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      reservationId: tokenA,
      providerMessageId: "provider-a",
    });
    assert(!claimed, "TEST 2: old owner claim must fail");
    assert(
      store.keys.get("waiting-list")?.providerMessageId === null,
      "TEST 2: current lease remains unclaimed",
    );
  }

  // TEST 3 — Correct Owner Claim
  {
    const store = createSimulatedStatusEmailStore();
    const reserveB = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-rejected",
      nowMs: 0,
    });
    const tokenB = reserveB.reservationId!;
    const claimed = simulateClaimStatusEmailSendV2({
      store,
      templateType: "application-rejected",
      reservationId: tokenB,
      providerMessageId: "provider-b",
    });
    assert(claimed, "TEST 3: correct owner claim succeeds");
  }

  // TEST 4 — Correct Owner Release
  {
    const store = createSimulatedStatusEmailStore();
    const reserveB = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-under-review",
      nowMs: 0,
    });
    const tokenB = reserveB.reservationId!;
    simulateReleaseStatusEmailSendV2({
      store,
      templateType: "application-under-review",
      reservationId: tokenB,
    });
    assert(
      !store.keys.has("application-under-review"),
      "TEST 4: correct owner release deletes only owned lease",
    );
  }

  // TEST 5 — Parallel stale takeover (simulated race resolution)
  {
    const store = createSimulatedStatusEmailStore();
    simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: 0,
    });
    const takeoverB = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 1,
    });
    const takeoverC = simulateReserveStatusEmailSendV2({
      store,
      templateType: "application-accepted",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 2,
    });
    const sendCount = Number(takeoverB.decision === "send") + Number(takeoverC.decision === "send");
    assert(sendCount === 1, "TEST 5: only one stale takeover may win");
  }

  // TEST 6 — Claimed reservation never stale-takeover
  {
    const store = createSimulatedStatusEmailStore();
    const reserve = simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: 0,
    });
    simulateClaimStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      reservationId: reserve.reservationId!,
      providerMessageId: "provider-claimed",
    });
    const retry = simulateReserveStatusEmailSendV2({
      store,
      templateType: "waiting-list",
      nowMs: STATUS_EMAIL_RESERVATION_LEASE_MS + 10_000,
    });
    assert(retry.decision === "skip", "TEST 6: claimed reservation blocks stale takeover");
  }

  // TEST 7 — sent email_log blocks new send
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
    assert(reserve.decision === "skip", "TEST 7: sent log blocks reserve");
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
    !leaseMigration.includes("CREATE OR REPLACE FUNCTION public.release_application_status_email_send("),
    "lease migration must not modify v1 release RPC",
  );
  assert(
    leaseMigration.includes("reservation_id = p_reservation_id"),
    "v2 claim/release must scope by reservation_id",
  );
  assert(
    leaseMigration.includes("interval '10 minutes'"),
    "lease migration defines 10 minute lease",
  );

  return "ok";
}
