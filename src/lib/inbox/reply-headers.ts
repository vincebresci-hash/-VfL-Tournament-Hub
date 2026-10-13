import { randomUUID } from "node:crypto";
import { normalizeMessageIdHeader } from "@/lib/inbox/identity";
import {
  containsHeaderInjection,
  formatMessageIdHeader,
  messageIdDomainFromEmail,
} from "@/lib/inbox/reply-validation";

export type InboxReplyThreadingInput = {
  parentMessageIdHeader: string | null;
  parentInReplyTo: string | null;
  parentReferencesHeader: string | null;
  /**
   * Required verified DNS domain (from INBOX_SMTP_FROM).
   * No inbox.local fallback — callers must supply a valid domain.
   */
  messageIdDomain: string;
};

export type InboxReplyThreadingHeaders = {
  /** Raw id without angle brackets (DB storage). */
  messageIdHeader: string;
  /** Angle-bracket form for SMTP. */
  messageIdSmtp: string;
  inReplyToHeader: string | null;
  referencesHeader: string | null;
};

function pushUniqueNormalized(target: string[], value: string | null | undefined) {
  const normalized = normalizeMessageIdHeader(value);
  if (!normalized || containsHeaderInjection(normalized)) {
    return;
  }
  if (!target.includes(normalized)) {
    target.push(normalized);
  }
}

/** Validate / normalize a Message-ID domain (rejects .local). */
export function assertMessageIdDomain(domain: string): string | null {
  const cleaned = domain.trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  if (!cleaned || cleaned === "inbox.local" || cleaned.endsWith(".local")) {
    return null;
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Prefer domain from explicit SMTP From; never invent inbox.local.
 */
export function resolveMessageIdDomain(input: {
  messageIdDomain?: string | null;
  fromAddress?: string | null;
}): string | null {
  if (input.messageIdDomain) {
    return assertMessageIdDomain(input.messageIdDomain);
  }
  if (input.fromAddress) {
    return messageIdDomainFromEmail(input.fromAddress);
  }
  return null;
}

/**
 * Build RFC-compliant threading headers for a reply.
 * Throws if messageIdDomain is missing/invalid — Production must never use inbox.local.
 */
export function buildInboxReplyThreadingHeaders(
  input: InboxReplyThreadingInput,
): InboxReplyThreadingHeaders {
  const safeDomain = assertMessageIdDomain(input.messageIdDomain);
  if (!safeDomain) {
    throw new Error("Message-ID domain is not configured or invalid.");
  }

  const messageIdHeader = `${randomUUID()}@${safeDomain}`;
  const messageIdSmtp = `<${messageIdHeader}>`;

  const parentMid = normalizeMessageIdHeader(input.parentMessageIdHeader);
  if (!parentMid) {
    return {
      messageIdHeader,
      messageIdSmtp,
      inReplyToHeader: null,
      referencesHeader: null,
    };
  }

  const chain: string[] = [];
  const parentRefs = (input.parentReferencesHeader ?? "").split(/\s+/);
  for (const part of parentRefs) {
    pushUniqueNormalized(chain, part);
  }
  pushUniqueNormalized(chain, input.parentInReplyTo);
  pushUniqueNormalized(chain, parentMid);

  const referencesHeader = chain.map((id) => `<${id}>`).join(" ");
  return {
    messageIdHeader,
    messageIdSmtp,
    inReplyToHeader: formatMessageIdHeader(parentMid),
    referencesHeader,
  };
}
