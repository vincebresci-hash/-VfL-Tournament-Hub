import type { InboxAddress } from "@/lib/inbox/types";

export type InboxImapIdentity = {
  mailboxId: string;
  folder: string;
  uidvalidity: number;
  imapUid: number;
};

export function inboxIdentityKey(identity: InboxImapIdentity): string {
  return `${identity.mailboxId}|${identity.folder}|${identity.uidvalidity}|${identity.imapUid}`;
}

export function normalizeMessageIdHeader(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().replace(/^<|>$/g, "").trim().toLowerCase();
  return trimmed || null;
}

export function normalizeEmailAddress(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function toInboxAddresses(
  values: Array<{ address?: string | null; name?: string | null } | string> | null | undefined,
): InboxAddress[] {
  if (!values?.length) {
    return [];
  }

  return values.map((entry) => {
    if (typeof entry === "string") {
      return { address: normalizeEmailAddress(entry), name: "" };
    }
    return {
      address: normalizeEmailAddress(entry.address),
      name: (entry.name ?? "").trim(),
    };
  });
}

/**
 * Thread key for UI grouping only — never used as a uniqueness constraint.
 */
export function deriveThreadKey(input: {
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  subject: string;
  fromAddress: string;
}): string {
  const references = (input.referencesHeader ?? "")
    .split(/\s+/)
    .map((part) => normalizeMessageIdHeader(part))
    .filter((part): part is string => Boolean(part));

  if (references.length > 0) {
    return `ref:${references[0]}`;
  }

  const inReplyTo = normalizeMessageIdHeader(input.inReplyTo);
  if (inReplyTo) {
    return `ref:${inReplyTo}`;
  }

  const messageId = normalizeMessageIdHeader(input.messageIdHeader);
  if (messageId) {
    return `mid:${messageId}`;
  }

  const subject = input.subject.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "").trim().toLowerCase();
  return `fallback:${input.fromAddress}|${subject}`;
}

/**
 * Pure cursor helper: never advance past unstored UIDs.
 * Expunged/missing UIDs may advance. Empty/malformed source UIDs must NOT.
 */
export function nextCursorAfterBatch(input: {
  previousCursor: number;
  attemptedUids: number[];
  storedUids: number[];
  missingUids: number[];
  emptySourceUids?: number[];
}): number {
  const relevant = [...input.attemptedUids].sort((a, b) => a - b);
  let cursor = input.previousCursor;
  const stored = new Set(input.storedUids);
  const missing = new Set(input.missingUids);
  const emptySource = new Set(input.emptySourceUids ?? []);

  for (const uid of relevant) {
    if (uid <= cursor) {
      continue;
    }
    if (emptySource.has(uid)) {
      break;
    }
    if (stored.has(uid) || missing.has(uid)) {
      cursor = uid;
      continue;
    }
    break;
  }

  return cursor;
}

/**
 * Mirrors SQL lock fencing: mutations require matching unexpired token.
 * Used by behavioral tests (no DB required).
 */
export function canMutateUnderInboxLock(input: {
  holderToken: string | null;
  expiresAtMs: number | null;
  workerToken: string;
  nowMs: number;
}): boolean {
  if (!input.holderToken || input.expiresAtMs == null) {
    return false;
  }
  return input.holderToken === input.workerToken && input.expiresAtMs >= input.nowMs;
}

export function filterUidsAfterCursor(uids: number[], cursorUid: number): number[] {
  return uids.filter((uid) => uid > cursorUid).sort((a, b) => a - b);
}

export function isUidvalidityReset(
  previous: number | null | undefined,
  next: number,
): boolean {
  return previous != null && previous !== next;
}
