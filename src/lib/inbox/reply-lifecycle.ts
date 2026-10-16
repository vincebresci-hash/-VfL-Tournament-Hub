/**
 * Pure send-state machine for inbox SMTP replies.
 *
 * Uncertain / abandoned sending outcomes must never automatically trigger another send.
 * Retries after clear failure require a NEW idempotency key AND no unresolved row
 * for the same parent (enforced in SQL claim).
 *
 * Manual reconciliation (ops / service_role):
 * 1. Inspect IONOS Sent/mailbox for the Message-ID on the uncertain row.
 * 2. Call reconcile_inbox_reply_status(reply_id, 'sent'|'failed', note)
 *    via service_role only — never from the browser.
 * 3. Do not invoke SMTP during reconciliation.
 */

import {
  INBOX_REPLY_STATUSES,
  type InboxReplyStatus,
} from "@/lib/inbox/types";

export { INBOX_REPLY_STATUSES, type InboxReplyStatus };

/** Abandoned `sending` rows older than this are treated as uncertain (SQL + helpers). */
export const INBOX_REPLY_SENDING_STALE_MS = 15 * 60 * 1000;

export type InboxReplyFinalizeStatus = Extract<
  InboxReplyStatus,
  "sent" | "failed" | "uncertain"
>;

export type InboxSmtpOutcome = "sent" | "failed" | "uncertain";

export type InboxReplyReconcileStatus = Extract<InboxReplyStatus, "sent" | "failed">;

/** Statuses that must not start a new SMTP attempt for the same idempotency key. */
export function blocksAutoResend(status: InboxReplyStatus): boolean {
  return (
    status === "sending" ||
    status === "uncertain" ||
    status === "sent" ||
    status === "failed" ||
    status === "pending"
  );
}

/** Unresolved parent-level sends block new idempotency keys (anti-duplicate). */
export function hasUnresolvedReplyBlocker(status: InboxReplyStatus): boolean {
  return status === "sending" || status === "uncertain";
}

export function mayInvokeSmtpAfterClaim(input: {
  sendAllowed: boolean;
  status: InboxReplyStatus;
}): boolean {
  return input.sendAllowed && input.status === "sending";
}

export function finalizeStatusForSmtpResult(result: {
  outcome: InboxSmtpOutcome;
}): InboxReplyFinalizeStatus {
  if (result.outcome === "sent") {
    return "sent";
  }
  if (result.outcome === "uncertain") {
    return "uncertain";
  }
  return "failed";
}

export function isTerminalReplyStatus(status: InboxReplyStatus): boolean {
  return status === "sent" || status === "failed" || status === "uncertain";
}

export function isStaleSending(input: {
  status: InboxReplyStatus;
  createdAtMs: number;
  nowMs: number;
  staleAfterMs?: number;
}): boolean {
  if (input.status !== "sending") {
    return false;
  }
  const staleAfter = input.staleAfterMs ?? INBOX_REPLY_SENDING_STALE_MS;
  return input.nowMs - input.createdAtMs >= staleAfter;
}

/** Behavioral model: stale sending is treated as uncertain before claim decisions. */
export function normalizeStatusForClaimGate(input: {
  status: InboxReplyStatus;
  createdAtMs: number;
  nowMs: number;
}): InboxReplyStatus {
  if (isStaleSending(input)) {
    return "uncertain";
  }
  return input.status;
}

export function applyReplyClaimTransition(input: {
  existingForKey: { status: InboxReplyStatus } | null;
  unresolvedForParent: boolean;
  rateLimited: boolean;
}): {
  status: InboxReplyStatus | null;
  sendAllowed: boolean;
  alreadyExisted: boolean;
  errorCode: string | null;
} {
  if (input.rateLimited) {
    return { status: null, sendAllowed: false, alreadyExisted: false, errorCode: "rate_limited" };
  }
  if (input.existingForKey) {
    return {
      status: input.existingForKey.status,
      sendAllowed: false,
      alreadyExisted: true,
      errorCode: null,
    };
  }
  if (input.unresolvedForParent) {
    return {
      status: null,
      sendAllowed: false,
      alreadyExisted: false,
      errorCode: "unresolved_reply_exists",
    };
  }
  return { status: "sending", sendAllowed: true, alreadyExisted: false, errorCode: null };
}

export function applyReplyFinalizeTransition(input: {
  current: InboxReplyStatus;
  next: InboxReplyFinalizeStatus;
}): { ok: true; status: InboxReplyFinalizeStatus } | { ok: false; status: InboxReplyStatus } {
  if (input.current !== "sending") {
    return { ok: false, status: input.current };
  }
  return { ok: true, status: input.next };
}

/** Manual reconcile: uncertain|sending → sent|failed only (no SMTP). */
export function applyReplyReconcileTransition(input: {
  current: InboxReplyStatus;
  next: InboxReplyReconcileStatus;
}): { ok: true; status: InboxReplyReconcileStatus } | { ok: false; status: InboxReplyStatus } {
  if (input.current !== "uncertain" && input.current !== "sending") {
    return { ok: false, status: input.current };
  }
  return { ok: true, status: input.next };
}

/** Explicit policy: never auto-retry SMTP for any status. */
export function shouldAutoRetrySmtp(status: InboxReplyStatus): boolean {
  void status;
  return false;
}

/**
 * Ops runbook (also enforced by reconcile_inbox_reply_status RPC):
 * - Do not call sendInboxSmtpMail for uncertain/abandoned rows.
 * - Confirm presence/absence of Message-ID in the IONOS mailbox.
 * - reconcile_inbox_reply_status(id, 'sent'|'failed', note) via service_role.
 */
export const INBOX_REPLY_RECONCILE_PROCEDURE = [
  "Locate the inbox_replies row (status uncertain or stale sending).",
  "Search the IONOS mailbox/Sent for message_id_header.",
  "If found delivered: reconcile_inbox_reply_status(id, 'sent', note).",
  "If confirmed not delivered: reconcile_inbox_reply_status(id, 'failed', note).",
  "If still unknown: leave uncertain; do not invent a new send.",
  "Only after failed/reconciled may an operator start a NEW reply with a new idempotency key.",
] as const;
