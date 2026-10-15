/**
 * Phase 4b runtime budget for attachment SMTP on the deployed admin segment.
 *
 * Confirmed: Vercel Hobby + Fluid Compute (plan maxDuration 300s).
 * Inbox segment maxDuration = 180s; IMAP sync API stays at 10s.
 *
 * Explicit reserves (ms) under the 180s wall clock:
 * - Pre-SMTP (claim/list/download/hash): must leave SMTP + finalize reserve
 * - SMTP send race: 90s
 * - Finalize + uncertain compensation: 20s reserved after SMTP
 *
 * Hard platform kill during SMTP can still leave delivery uncertain and requires
 * manual review — never auto-resend (see shouldAutoRetrySmtp / reconcile runbook).
 *
 * Production keeps `allowAttachmentSend: false` until E2E approval.
 */

/** Must match `export const maxDuration` on `/admin/posteingang`. */
export const INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS = 180;

/** Minimum segment duration required before attachment SMTP may be enabled. */
export const INBOX_REPLY_ATTACHMENT_MIN_DURATION_SECONDS = 120;

/** Approved product caps (Phase 4a). */
export const INBOX_REPLY_ATTACHMENT_APPROVED_MAX_TOTAL_BYTES = 12 * 1024 * 1024;

/**
 * Bounded SMTP timeouts — connection ≤ socket ≤ send.
 * Send timeout + finalize reserve must fit under maxDuration with pre-SMTP work.
 */
export const INBOX_SMTP_CONNECTION_TIMEOUT_MS = 15_000;
export const INBOX_SMTP_SOCKET_TIMEOUT_MS = 90_000;
export const INBOX_SMTP_SEND_TIMEOUT_MS = 90_000;

/** Wall-clock reserved after SMTP for finalize + uncertain compensation. */
export const INBOX_REPLY_SMTP_FINALIZE_RESERVE_MS = 20_000;

/**
 * Minimum remaining ms required before starting SMTP
 * (= send race + finalize/compensation reserve).
 */
export const INBOX_REPLY_MIN_REMAINING_MS_BEFORE_SMTP =
  INBOX_SMTP_SEND_TIMEOUT_MS + INBOX_REPLY_SMTP_FINALIZE_RESERVE_MS;

export const INBOX_REPLY_PLATFORM_KILL_UNCERTAIN_NOTE =
  "A hard Vercel/platform kill during SMTP can leave delivery uncertain; never auto-resend — use reconcile runbook.";

export type InboxReplyAttachmentRuntimeDecision =
  | { ok: true }
  | {
      ok: false;
      code: "attachments_runtime_budget";
      message: string;
    };

/**
 * Gate before claim: flag + segment duration + optional known byte total.
 * Pass actual validated bytes when known; omit/0 skips the size clause here
 * (authoritative size check runs after bound list / download).
 */
export function evaluateInboxReplyAttachmentRuntimeBudget(input: {
  attachmentCount: number;
  /** Actual total bytes when known; 0 skips size check at this gate. */
  totalBytes: number;
  allowAttachmentSend?: boolean;
  deploymentMaxDurationSeconds?: number;
}): InboxReplyAttachmentRuntimeDecision {
  if (input.attachmentCount <= 0) {
    return { ok: true };
  }

  if (input.allowAttachmentSend !== true) {
    return {
      ok: false,
      code: "attachments_runtime_budget",
      message:
        "Anhangversand ist noch nicht freigeschaltet. Textantworten bleiben möglich.",
    };
  }

  const maxDuration =
    input.deploymentMaxDurationSeconds ?? INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS;
  if (maxDuration < INBOX_REPLY_ATTACHMENT_MIN_DURATION_SECONDS) {
    return {
      ok: false,
      code: "attachments_runtime_budget",
      message:
        "Anhangversand ist auf diesem Deployment nicht freigeschaltet (Server-Zeitbudget zu kurz). Textantworten bleiben möglich.",
    };
  }

  if (
    input.totalBytes > 0 &&
    input.totalBytes > INBOX_REPLY_ATTACHMENT_APPROVED_MAX_TOTAL_BYTES
  ) {
    return {
      ok: false,
      code: "attachments_runtime_budget",
      message: "Anhänge überschreiten das freigegebene Größenlimit.",
    };
  }

  return { ok: true };
}

/** Whether wall-clock remaining allows starting SMTP without starving finalize. */
export function canStartInboxReplySmtp(input: {
  startedAtMs: number;
  nowMs: number;
  deploymentMaxDurationSeconds?: number;
  smtpSendTimeoutMs?: number;
  finalizeReserveMs?: number;
}): boolean {
  const maxDurationSec =
    input.deploymentMaxDurationSeconds ?? INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS;
  const sendTimeout = input.smtpSendTimeoutMs ?? INBOX_SMTP_SEND_TIMEOUT_MS;
  const finalizeReserve = input.finalizeReserveMs ?? INBOX_REPLY_SMTP_FINALIZE_RESERVE_MS;
  const deadlineMs = input.startedAtMs + maxDurationSec * 1000;
  const remaining = deadlineMs - input.nowMs;
  return remaining >= sendTimeout + finalizeReserve;
}

export function remainingInboxReplyBudgetMs(input: {
  startedAtMs: number;
  nowMs: number;
  deploymentMaxDurationSeconds?: number;
}): number {
  const maxDurationSec =
    input.deploymentMaxDurationSeconds ?? INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS;
  return Math.max(0, input.startedAtMs + maxDurationSec * 1000 - input.nowMs);
}
