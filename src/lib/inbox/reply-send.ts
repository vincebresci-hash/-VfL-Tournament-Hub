import type { AuthSession } from "@/types/auth";
import type { loadUserAuthorization } from "@/lib/rbac/queries";
import {
  finalizeStatusForSmtpResult,
  mayInvokeSmtpAfterClaim,
  shouldAutoRetrySmtp,
  type InboxReplyFinalizeStatus,
} from "@/lib/inbox/reply-lifecycle";
import { assertMessageIdDomain } from "@/lib/inbox/reply-headers";
import { validateInboxReplyDraft } from "@/lib/inbox/reply-validation";
import type { InboxReplyStatus } from "@/lib/inbox/types";

/** Structural SMTP config — avoids importing server-only smtp-config in checks. */
export type InboxReplySmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName: string | null;
  messageIdDomain: string;
};

export type InboxReplySmtpMailInput = {
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
};

export type InboxReplySmtpSendResult =
  | { outcome: "sent"; response: string | null }
  | { outcome: "failed"; error: string; response: string | null }
  | { outcome: "uncertain"; error: string; response: string | null };

type Authorization = Awaited<ReturnType<typeof loadUserAuthorization>>;

const PARENT_MESSAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Every error_code emitted by public.claim_inbox_reply_send. */
export const CLAIM_INBOX_REPLY_SQL_ERROR_CODES = [
  "not_authenticated",
  "not_authorized_view",
  "not_authorized",
  "invalid_idempotency_key",
  "invalid_input",
  "header_injection",
  "parent_not_found",
  "recipient_locked",
  "domain_not_configured",
  "unresolved_reply_exists",
  "rate_limited",
  "claim_race",
] as const;

export type ClaimInboxReplySqlErrorCode = (typeof CLAIM_INBOX_REPLY_SQL_ERROR_CODES)[number];

export type SendInboxReplyInput = {
  parentMessageId: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  idempotencyKey: string;
  /**
   * Reserved for a later phase. Phase 2 rejects any supplied attachments value.
   * Do not accept filesystem paths or raw binary here.
   */
  attachments?: ReadonlyArray<unknown> | null;
};

export type SendInboxReplyErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_parent_id"
  | "parent_not_found"
  | "validation"
  | "attachments_not_supported"
  | "smtp_not_configured"
  | "domain_not_configured"
  | "domain_mismatch"
  | "rate_limited"
  | "unresolved_reply_exists"
  | "claim_failed"
  | "finalize_failed"
  | "smtp_failed"
  | "smtp_uncertain"
  | "already_exists";

export type SendInboxReplyResult = {
  ok: boolean;
  replyId: string | null;
  status: InboxReplyStatus | null;
  sendAttempted: boolean;
  error: string | null;
  errorCode: SendInboxReplyErrorCode | null;
};

export type InboxReplyParentMessage = {
  id: string;
  mailboxId: string;
  fromAddress: string;
  subject: string;
};

export type InboxReplyClaimRow = {
  replyId: string | null;
  status: InboxReplyStatus | null;
  sendAllowed: boolean;
  alreadyExisted: boolean;
  errorCode: string | null;
  messageIdHeader: string | null;
  inReplyToHeader: string | null;
  referencesHeader: string | null;
};

export type InboxReplyOperationalAlert = {
  kind: "inbox_reply_finalize_compensation_failed";
  replyId: string;
  parentMessageId: string;
  smtpOutcome: "sent" | "failed" | "uncertain";
  primaryFinalizeOk: false;
  compensationFinalizeOk: false;
  /** Sanitized; never includes SMTP passwords or service_role material. */
  detail: string;
};

export type InboxReplySendDeps = {
  requireSession: () => Promise<{
    error: string | null;
    session: AuthSession | null;
    authorization: Authorization | null;
  }>;
  canReply: (
    session: AuthSession | null | undefined,
    authorization: Authorization | null | undefined,
  ) => boolean;
  readSmtpConfig: () => InboxReplySmtpConfig | null;
  loadParentMessage: (parentMessageId: string) => Promise<InboxReplyParentMessage | null>;
  ensureMessageIdDomain: (input: {
    mailboxId: string;
    messageIdDomain: string;
  }) => Promise<{ ok: true } | { ok: false; code: "domain_mismatch" | "domain_not_configured"; error: string }>;
  claimReply: (input: {
    parentMessageId: string;
    idempotencyKey: string;
    toAddress: string;
    subject: string;
    bodyText: string;
  }) => Promise<{ row: InboxReplyClaimRow | null; error: string | null }>;
  sendSmtp: (
    config: InboxReplySmtpConfig,
    mail: InboxReplySmtpMailInput,
  ) => Promise<InboxReplySmtpSendResult>;
  finalizeReply: (input: {
    replyId: string;
    status: InboxReplyFinalizeStatus;
    error: string | null;
    smtpResponse: string | null;
  }) => Promise<{ ok: boolean; error: string | null }>;
  /**
   * Server-only operational alert. Must never include credentials.
   * Optional in unit tests; wired in the real action.
   */
  emitOperationalAlert?: (alert: InboxReplyOperationalAlert) => void;
};

function fail(
  errorCode: SendInboxReplyErrorCode,
  error: string,
  extras?: Partial<SendInboxReplyResult>,
): SendInboxReplyResult {
  return {
    ok: false,
    replyId: extras?.replyId ?? null,
    status: extras?.status ?? null,
    sendAttempted: extras?.sendAttempted ?? false,
    error,
    errorCode,
  };
}

/**
 * Redact credential-like substrings before persisting SMTP audit fields.
 * Applied in the app layer; SQL finalize also redacts as defense in depth.
 */
export function redactInboxSmtpAuditText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed) {
    return null;
  }
  return trimmed
    .replace(/pass(word)?[=:]\s*\S+/gi, "password=[redacted]")
    .replace(/\bAUTH\s+[A-Z0-9_-]+\s+\S+/gi, "AUTH [redacted]")
    .replace(/\b(user(name)?|login)[=:]\s*\S+/gi, "$1=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/service[_-]?role[=:]\s*\S+/gi, "service_role=[redacted]");
}

/** Map every SQL claim error_code to a safe client error. */
export function mapClaimErrorCode(code: string | null | undefined): {
  errorCode: SendInboxReplyErrorCode;
  message: string;
} {
  switch (code) {
    case "not_authenticated":
      return { errorCode: "unauthorized", message: "Nicht autorisiert." };
    case "not_authorized_view":
    case "not_authorized":
      return { errorCode: "forbidden", message: "Keine Berechtigung zum Antworten." };
    case "invalid_idempotency_key":
      return { errorCode: "validation", message: "Ungültiger Idempotenzschlüssel." };
    case "invalid_input":
      return {
        errorCode: "validation",
        message: "Antwortangaben sind ungültig oder zu lang.",
      };
    case "header_injection":
      return {
        errorCode: "validation",
        message: "Antwort enthält ungültige Zeichen.",
      };
    case "parent_not_found":
      return { errorCode: "parent_not_found", message: "Nachricht nicht gefunden." };
    case "recipient_locked":
      return {
        errorCode: "validation",
        message: "Antworten sind nur an den ursprünglichen Absender erlaubt.",
      };
    case "domain_not_configured":
      return {
        errorCode: "domain_not_configured",
        message: "Message-ID-Domain ist für dieses Postfach nicht konfiguriert.",
      };
    case "unresolved_reply_exists":
      return {
        errorCode: "unresolved_reply_exists",
        message:
          "Für diese Nachricht läuft bereits ein Versand oder der Status ist unklar. Bitte nicht erneut senden.",
      };
    case "rate_limited":
      return {
        errorCode: "rate_limited",
        message: "Zu viele Antworten in kurzer Zeit. Bitte später erneut versuchen.",
      };
    case "claim_race":
      return {
        errorCode: "claim_failed",
        message: "Antwort konnte nicht vorbereitet werden. Bitte erneut versuchen.",
      };
    default:
      return {
        errorCode: "claim_failed",
        message: "Antwort konnte nicht vorbereitet werden.",
      };
  }
}

function isReplyStatus(value: string | null | undefined): value is InboxReplyStatus {
  return (
    value === "pending" ||
    value === "sending" ||
    value === "sent" ||
    value === "failed" ||
    value === "uncertain"
  );
}

export function parseClaimInboxReplyRow(value: unknown): InboxReplyClaimRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  const statusRaw =
    typeof record.reply_status === "string"
      ? record.reply_status
      : typeof record.status === "string"
        ? record.status
        : null;
  const status = isReplyStatus(statusRaw) ? statusRaw : null;
  return {
    replyId: typeof record.reply_id === "string" ? record.reply_id : null,
    status,
    sendAllowed: record.send_allowed === true,
    alreadyExisted: record.already_existed === true,
    errorCode: typeof record.error_code === "string" ? record.error_code : null,
    messageIdHeader:
      typeof record.message_id_header === "string" ? record.message_id_header : null,
    inReplyToHeader:
      typeof record.in_reply_to_header === "string" ? record.in_reply_to_header : null,
    referencesHeader:
      typeof record.references_header === "string" ? record.references_header : null,
  };
}

/**
 * Ensure mailbox Message-ID domain matches the configured IONOS From domain.
 * Sets the domain when unset; refuses silent overwrite on mismatch.
 */
export function resolveMailboxMessageIdDomainUpdate(input: {
  currentDomain: string | null | undefined;
  configuredDomain: string;
}): {
  action: "ok" | "set" | "mismatch" | "invalid";
  domain: string | null;
} {
  const configured = assertMessageIdDomain(input.configuredDomain);
  if (!configured) {
    return { action: "invalid", domain: null };
  }
  const currentRaw = (input.currentDomain ?? "").trim().toLowerCase();
  if (!currentRaw) {
    return { action: "set", domain: configured };
  }
  const current = assertMessageIdDomain(currentRaw);
  if (!current) {
    return { action: "mismatch", domain: null };
  }
  if (current !== configured) {
    return { action: "mismatch", domain: null };
  }
  return { action: "ok", domain: configured };
}

function userMessageForSmtpOutcome(result: InboxReplySmtpSendResult): string {
  if (result.outcome === "sent") {
    return "Antwort wurde gesendet.";
  }
  if (result.outcome === "uncertain") {
    return "Versandstatus unklar. Bitte nicht erneut senden — prüfen Sie ggf. den Postausgang.";
  }
  return "Antwort konnte nicht gesendet werden.";
}

const UNCERTAIN_NO_RETRY_MESSAGE =
  "Versandstatus unklar. Bitte nicht erneut senden — prüfen Sie ggf. den Postausgang oder kontaktieren Sie einen Administrator.";

/**
 * After SMTP, persist status via service_role finalize.
 * On primary finalize failure: one compensating finalize to uncertain (never SMTP again).
 */
async function finalizeAfterSmtp(input: {
  replyId: string;
  parentMessageId: string;
  smtpResult: InboxReplySmtpSendResult;
  deps: InboxReplySendDeps;
}): Promise<SendInboxReplyResult> {
  const { replyId, parentMessageId, smtpResult, deps } = input;
  const primaryStatus = finalizeStatusForSmtpResult(smtpResult);
  const safeError =
    smtpResult.outcome === "sent"
      ? null
      : redactInboxSmtpAuditText(smtpResult.error);
  const safeResponse = redactInboxSmtpAuditText(smtpResult.response);

  const primary = await deps.finalizeReply({
    replyId,
    status: primaryStatus,
    error: safeError,
    smtpResponse: safeResponse,
  });

  if (primary.ok) {
    if (smtpResult.outcome === "sent") {
      return {
        ok: true,
        replyId,
        status: "sent",
        sendAttempted: true,
        error: null,
        errorCode: null,
      };
    }
    if (smtpResult.outcome === "uncertain") {
      return fail("smtp_uncertain", userMessageForSmtpOutcome(smtpResult), {
        replyId,
        status: "uncertain",
        sendAttempted: true,
      });
    }
    return fail("smtp_failed", userMessageForSmtpOutcome(smtpResult), {
      replyId,
      status: "failed",
      sendAttempted: true,
    });
  }

  // Primary finalize failed — never invoke SMTP again.
  // Compensate to uncertain so durable state is unresolved-safe (blocks new keys).
  const compensation = await deps.finalizeReply({
    replyId,
    status: "uncertain",
    error: redactInboxSmtpAuditText(
      `finalize_primary_failed:${primaryStatus}:${safeError ?? "no_smtp_error"}`,
    ),
    smtpResponse: safeResponse,
  });

  if (!compensation.ok) {
    deps.emitOperationalAlert?.({
      kind: "inbox_reply_finalize_compensation_failed",
      replyId,
      parentMessageId,
      smtpOutcome: smtpResult.outcome,
      primaryFinalizeOk: false,
      compensationFinalizeOk: false,
      detail: `smtp=${smtpResult.outcome}; primary_target=${primaryStatus}`,
    });
  }

  // Whether compensation succeeded or not: never tell the client a retry is safe.
  // If compensation wrote uncertain, DB blocks new keys. If not, row may still be
  // sending — also blocks new keys via unresolved until stale expiry / ops.
  if (smtpResult.outcome === "failed" && compensation.ok) {
    // Durable uncertain after clear SMTP failure: still instruct no automatic retry;
    // a deliberate new idempotency key is only safe after ops reconcile to failed.
    return fail("finalize_failed", UNCERTAIN_NO_RETRY_MESSAGE, {
      replyId,
      status: "uncertain",
      sendAttempted: true,
    });
  }

  return fail("finalize_failed", UNCERTAIN_NO_RETRY_MESSAGE, {
    replyId,
    status: "uncertain",
    sendAttempted: true,
  });
}

/**
 * Phase 2 orchestrator: auth → validate → ensure Message-ID domain → claim →
 * IONOS SMTP (once) → service_role finalize (+ compensating uncertain). Never auto-retries.
 */
export async function executeInboxReplySend(
  input: SendInboxReplyInput,
  deps: InboxReplySendDeps,
): Promise<SendInboxReplyResult> {
  const access = await deps.requireSession();
  if (access.error || !access.session || !access.authorization) {
    return fail("unauthorized", access.error ?? "Nicht autorisiert.");
  }
  if (!deps.canReply(access.session, access.authorization)) {
    return fail("forbidden", "Keine Berechtigung zum Antworten.");
  }

  // L1: reject any supplied attachments value in v1 (not only non-empty arrays).
  if (input.attachments !== undefined && input.attachments !== null) {
    return fail(
      "attachments_not_supported",
      "Anhänge werden für Antworten noch nicht unterstützt.",
    );
  }

  const parentMessageId = input.parentMessageId.trim();
  if (!PARENT_MESSAGE_ID_RE.test(parentMessageId)) {
    return fail("invalid_parent_id", "Ungültige Nachrichten-ID.");
  }

  const smtpConfig = deps.readSmtpConfig();
  if (!smtpConfig) {
    return fail(
      "smtp_not_configured",
      "E-Mail-Versand ist nicht konfiguriert. Bitte Administrator kontaktieren.",
    );
  }

  const parent = await deps.loadParentMessage(parentMessageId);
  if (!parent) {
    return fail("parent_not_found", "Nachricht nicht gefunden.");
  }

  const draft = validateInboxReplyDraft({
    requestedTo: input.toAddress,
    originalFromAddress: parent.fromAddress,
    subject: input.subject,
    originalSubject: parent.subject,
    bodyText: input.bodyText,
    idempotencyKey: input.idempotencyKey,
  });
  if (!draft.ok) {
    return fail("validation", draft.message);
  }

  const domainReady = await deps.ensureMessageIdDomain({
    mailboxId: parent.mailboxId,
    messageIdDomain: smtpConfig.messageIdDomain,
  });
  if (!domainReady.ok) {
    return fail(domainReady.code, domainReady.error);
  }

  const claim = await deps.claimReply({
    parentMessageId: parent.id,
    idempotencyKey: draft.idempotencyKey,
    toAddress: draft.toAddress,
    subject: draft.subject,
    bodyText: draft.bodyText,
  });
  if (claim.error || !claim.row) {
    return fail("claim_failed", "Antwort konnte nicht vorbereitet werden.");
  }

  const claimed = claim.row;
  if (claimed.errorCode) {
    const mapped = mapClaimErrorCode(claimed.errorCode);
    return fail(mapped.errorCode, mapped.message, {
      replyId: claimed.replyId,
      status: claimed.status,
    });
  }

  // Idempotent replay: never invoke SMTP again for an existing key.
  if (claimed.alreadyExisted || !claimed.sendAllowed) {
    if (claimed.status === "sent") {
      return {
        ok: true,
        replyId: claimed.replyId,
        status: claimed.status,
        sendAttempted: false,
        error: null,
        errorCode: null,
      };
    }
    if (claimed.status === "uncertain") {
      return fail("smtp_uncertain", UNCERTAIN_NO_RETRY_MESSAGE, {
        replyId: claimed.replyId,
        status: "uncertain",
        sendAttempted: false,
      });
    }
    if (claimed.status === "failed") {
      return fail(
        "already_exists",
        "Diese Antwort ist bereits fehlgeschlagen. Ein neuer Versuch erfordert einen neuen Idempotenzschlüssel und darf nur erfolgen, wenn kein unklarer Versand mehr offen ist.",
        {
          replyId: claimed.replyId,
          status: "failed",
          sendAttempted: false,
        },
      );
    }
    if (claimed.status === "sending") {
      return fail(
        "unresolved_reply_exists",
        "Für diese Antwort läuft bereits ein Versand. Bitte nicht erneut senden.",
        {
          replyId: claimed.replyId,
          status: "sending",
          sendAttempted: false,
        },
      );
    }
    return fail("already_exists", "Antwort existiert bereits.", {
      replyId: claimed.replyId,
      status: claimed.status,
      sendAttempted: false,
    });
  }

  if (
    !claimed.replyId ||
    !claimed.messageIdHeader ||
    !mayInvokeSmtpAfterClaim({
      sendAllowed: claimed.sendAllowed,
      status: claimed.status ?? "pending",
    })
  ) {
    return fail("claim_failed", "Antwort konnte nicht vorbereitet werden.", {
      replyId: claimed.replyId,
      status: claimed.status,
    });
  }

  // Policy guard: never auto-retry for any status (including uncertain).
  if (shouldAutoRetrySmtp(claimed.status ?? "sending")) {
    return fail("claim_failed", "Antwort konnte nicht vorbereitet werden.", {
      replyId: claimed.replyId,
      status: claimed.status,
    });
  }

  const smtpResult = await deps.sendSmtp(smtpConfig, {
    to: draft.toAddress,
    subject: draft.subject,
    text: draft.bodyText,
    messageId: claimed.messageIdHeader,
    inReplyTo: claimed.inReplyToHeader,
    references: claimed.referencesHeader,
  });

  return finalizeAfterSmtp({
    replyId: claimed.replyId,
    parentMessageId: parent.id,
    smtpResult,
    deps,
  });
}
