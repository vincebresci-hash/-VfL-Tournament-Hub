import { normalizeEmailAddress, normalizeMessageIdHeader } from "@/lib/inbox/identity";

export const INBOX_REPLY_MAX_SUBJECT_LENGTH = 200;
export const INBOX_REPLY_MAX_BODY_LENGTH = 20_000;
export const INBOX_REPLY_MAX_ADDRESS_LENGTH = 320;
/** Default sliding-window rate limit foundation (enforced in a later send action). */
export const INBOX_REPLY_RATE_LIMIT_MAX = 20;
export const INBOX_REPLY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const CONTROL_OR_SEPARATOR = /[\r\n\u0000-\u001f\u007f]/;

export type InboxReplyValidationErrorCode =
  | "empty_recipient"
  | "invalid_recipient"
  | "recipient_mismatch"
  | "empty_subject"
  | "subject_too_long"
  | "subject_injection"
  | "empty_body"
  | "body_too_long"
  | "invalid_idempotency_key"
  | "missing_parent_sender";

export type InboxReplyValidationResult =
  | {
      ok: true;
      toAddress: string;
      subject: string;
      bodyText: string;
      idempotencyKey: string;
    }
  | {
      ok: false;
      code: InboxReplyValidationErrorCode;
      message: string;
    };

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function containsHeaderInjection(value: string): boolean {
  return CONTROL_OR_SEPARATOR.test(value);
}

export function isValidEmailAddress(value: string): boolean {
  const normalized = normalizeEmailAddress(value);
  if (!normalized || normalized.length > INBOX_REPLY_MAX_ADDRESS_LENGTH) {
    return false;
  }
  if (containsHeaderInjection(normalized)) {
    return false;
  }
  return EMAIL_RE.test(normalized);
}

/**
 * v1: To must equal the original message sender (normalized).
 */
export function assertReplyRecipientLocked(input: {
  requestedTo: string;
  originalFromAddress: string;
}): { ok: true; toAddress: string } | { ok: false; code: InboxReplyValidationErrorCode; message: string } {
  const original = normalizeEmailAddress(input.originalFromAddress);
  if (!original || !isValidEmailAddress(original)) {
    return {
      ok: false,
      code: "missing_parent_sender",
      message: "Die Originalnachricht hat keinen gültigen Absender.",
    };
  }

  const requested = normalizeEmailAddress(input.requestedTo);
  if (!requested) {
    return { ok: false, code: "empty_recipient", message: "Empfänger fehlt." };
  }
  if (!isValidEmailAddress(requested)) {
    return { ok: false, code: "invalid_recipient", message: "Ungültiger Empfänger." };
  }
  if (requested !== original) {
    return {
      ok: false,
      code: "recipient_mismatch",
      message: "Antworten sind nur an den ursprünglichen Absender erlaubt.",
    };
  }

  return { ok: true, toAddress: requested };
}

/** Leading reply markers used by English (Re) and German (AW) clients. */
const REPLY_PREFIX_RE = /^(re|aw)\s*:\s*/i;

export type InboxReplySubjectPrefix = "Re" | "AW";

/**
 * Strip stacked / mixed reply prefixes (Re:/AW:) and remember the first one.
 * Examples: "Re: AW: Hallo" → core "Hallo", first "Re"; "AW: Hallo" → keep "AW".
 */
export function stripReplySubjectPrefixes(value: string): {
  core: string;
  firstPrefix: InboxReplySubjectPrefix | null;
} {
  let remaining = value.trim().replace(/\s+/g, " ");
  let firstPrefix: InboxReplySubjectPrefix | null = null;

  while (remaining.length > 0) {
    const match = REPLY_PREFIX_RE.exec(remaining);
    if (!match) {
      break;
    }
    if (!firstPrefix) {
      firstPrefix = match[1]!.toLowerCase() === "aw" ? "AW" : "Re";
    }
    remaining = remaining.slice(match[0].length).trimStart();
  }

  return {
    core: remaining.trim() || "(ohne Betreff)",
    firstPrefix,
  };
}

/**
 * Normalize a reply subject to a single reply prefix.
 * - Preserves an existing single "AW:" or "Re:" prefix.
 * - Collapses repeated / mixed stacks ("Re: AW:", "AW: Re:", "Re: Re:") to one prefix
 *   (keeps the first marker found).
 * - Adds "Re:" when no reply prefix is present.
 */
export function normalizeReplySubject(subject: string, originalSubject: string): string {
  const base = (subject.trim() || originalSubject.trim() || "(ohne Betreff)").trim();
  const { core, firstPrefix } = stripReplySubjectPrefixes(base);
  const prefix = firstPrefix ?? "Re";
  return `${prefix}: ${core}`.replace(/\s+/g, " ").trim();
}

export function validateReplySubject(subject: string): {
  ok: true;
  subject: string;
} | {
  ok: false;
  code: InboxReplyValidationErrorCode;
  message: string;
} {
  const trimmed = subject.trim();
  if (!trimmed) {
    return { ok: false, code: "empty_subject", message: "Betreff fehlt." };
  }
  if (containsHeaderInjection(trimmed)) {
    return {
      ok: false,
      code: "subject_injection",
      message: "Betreff enthält ungültige Zeichen.",
    };
  }
  if (trimmed.length > INBOX_REPLY_MAX_SUBJECT_LENGTH) {
    return {
      ok: false,
      code: "subject_too_long",
      message: `Betreff darf höchstens ${INBOX_REPLY_MAX_SUBJECT_LENGTH} Zeichen haben.`,
    };
  }
  return { ok: true, subject: trimmed };
}

export function validateReplyBodyText(bodyText: string): {
  ok: true;
  bodyText: string;
} | {
  ok: false;
  code: InboxReplyValidationErrorCode;
  message: string;
} {
  // Preserve intentional newlines; reject NULs only.
  if (bodyText.includes("\u0000")) {
    return { ok: false, code: "empty_body", message: "Nachrichtentext ist ungültig." };
  }
  const normalized = bodyText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { ok: false, code: "empty_body", message: "Nachrichtentext fehlt." };
  }
  if (normalized.length > INBOX_REPLY_MAX_BODY_LENGTH) {
    return {
      ok: false,
      code: "body_too_long",
      message: `Nachricht darf höchstens ${INBOX_REPLY_MAX_BODY_LENGTH} Zeichen haben.`,
    };
  }
  return { ok: true, bodyText: normalized };
}

export function validateIdempotencyKey(value: string): {
  ok: true;
  idempotencyKey: string;
} | {
  ok: false;
  code: InboxReplyValidationErrorCode;
  message: string;
} {
  const key = value.trim().toLowerCase();
  if (!UUID_RE.test(key)) {
    return {
      ok: false,
      code: "invalid_idempotency_key",
      message: "Ungültiger Idempotenzschlüssel.",
    };
  }
  return { ok: true, idempotencyKey: key };
}

export function validateInboxReplyDraft(input: {
  requestedTo: string;
  originalFromAddress: string;
  subject: string;
  originalSubject: string;
  bodyText: string;
  idempotencyKey: string;
}): InboxReplyValidationResult {
  const recipient = assertReplyRecipientLocked({
    requestedTo: input.requestedTo,
    originalFromAddress: input.originalFromAddress,
  });
  if (!recipient.ok) {
    return recipient;
  }

  const subjectResult = validateReplySubject(
    normalizeReplySubject(input.subject, input.originalSubject),
  );
  if (!subjectResult.ok) {
    return subjectResult;
  }

  const bodyResult = validateReplyBodyText(input.bodyText);
  if (!bodyResult.ok) {
    return bodyResult;
  }

  const keyResult = validateIdempotencyKey(input.idempotencyKey);
  if (!keyResult.ok) {
    return keyResult;
  }

  return {
    ok: true,
    toAddress: recipient.toAddress,
    subject: subjectResult.subject,
    bodyText: bodyResult.bodyText,
    idempotencyKey: keyResult.idempotencyKey,
  };
}

export function isInboxReplyRateLimited(input: {
  recentCount: number;
  max?: number;
}): boolean {
  const max = input.max ?? INBOX_REPLY_RATE_LIMIT_MAX;
  return input.recentCount >= max;
}

export function rateLimitWindowStart(nowMs: number, windowMs = INBOX_REPLY_RATE_LIMIT_WINDOW_MS): Date {
  return new Date(nowMs - windowMs);
}

/** Angle-bracket Message-ID for SMTP headers. */
export function formatMessageIdHeader(raw: string): string | null {
  const normalized = normalizeMessageIdHeader(raw);
  if (!normalized || containsHeaderInjection(normalized)) {
    return null;
  }
  return `<${normalized}>`;
}

/**
 * Extract a DNS domain from an email address for Message-ID generation.
 * Rejects inbox.local and other .local domains.
 */
export function messageIdDomainFromEmail(fromAddress: string): string | null {
  const normalized = fromAddress.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) {
    return null;
  }
  const domain = normalized
    .slice(at + 1)
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "");
  if (!domain || domain === "inbox.local" || domain.endsWith(".local")) {
    return null;
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return null;
  }
  return domain;
}
