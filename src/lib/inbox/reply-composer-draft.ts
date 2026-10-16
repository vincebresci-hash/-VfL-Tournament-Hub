/**
 * Session-scoped reply draft persistence (subject + body only).
 * Keyed by authenticated actor + parent message so drafts never leak across users/messages.
 * Never stores upload tokens, storage paths, credentials, or attachment metadata.
 *
 * Clear-event coordination (M4d-1 / R1):
 * - In-memory registry stores only a non-reversible fingerprint of sent subject/body
 *   (never plaintext message content).
 * - Composers must keep subject/body refs authoritative synchronously with user edits
 *   so clear listeners never read a stale post-commit snapshot.
 */

const DRAFT_KEY_PREFIX = "vfl.inbox.replyDraft.v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReplyComposerDraftV1 = {
  v: 1;
  subject: string;
  bodyText: string;
};

export type ReplyComposerDraftStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function buildReplyComposerDraftStorageKey(
  actorId: string,
  parentMessageId: string,
): string | null {
  const actor = actorId.trim();
  const parent = parentMessageId.trim();
  if (!UUID_RE.test(actor) || !UUID_RE.test(parent)) {
    return null;
  }
  return `${DRAFT_KEY_PREFIX}:${actor}:${parent}`;
}

export function parseReplyComposerDraft(raw: string | null | undefined): {
  subject: string;
  bodyText: string;
} | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ReplyComposerDraftV1>;
    if (parsed?.v !== 1 || typeof parsed.subject !== "string" || typeof parsed.bodyText !== "string") {
      return null;
    }
    // Reject accidental persistence of privileged fields.
    const keys = Object.keys(parsed);
    for (const key of keys) {
      if (key !== "v" && key !== "subject" && key !== "bodyText") {
        return null;
      }
    }
    return {
      subject: parsed.subject.slice(0, 200),
      bodyText: parsed.bodyText.slice(0, 20_000),
    };
  } catch {
    return null;
  }
}

export function serializeReplyComposerDraft(input: {
  subject: string;
  bodyText: string;
}): string {
  const payload: ReplyComposerDraftV1 = {
    v: 1,
    subject: input.subject.slice(0, 200),
    bodyText: input.bodyText.slice(0, 20_000),
  };
  return JSON.stringify(payload);
}

export function readReplyComposerDraft(
  store: ReplyComposerDraftStore | null | undefined,
  actorId: string,
  parentMessageId: string,
): { subject: string; bodyText: string } | null {
  const key = buildReplyComposerDraftStorageKey(actorId, parentMessageId);
  if (!store || !key) {
    return null;
  }
  try {
    return parseReplyComposerDraft(store.getItem(key));
  } catch {
    return null;
  }
}

export function writeReplyComposerDraft(
  store: ReplyComposerDraftStore | null | undefined,
  actorId: string,
  parentMessageId: string,
  draft: { subject: string; bodyText: string },
): boolean {
  const key = buildReplyComposerDraftStorageKey(actorId, parentMessageId);
  if (!store || !key) {
    return false;
  }
  try {
    store.setItem(key, serializeReplyComposerDraft(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearReplyComposerDraft(
  store: ReplyComposerDraftStore | null | undefined,
  actorId: string,
  parentMessageId: string,
): void {
  const key = buildReplyComposerDraftStorageKey(actorId, parentMessageId);
  if (!store || !key) {
    return;
  }
  try {
    store.removeItem(key);
  } catch {
    // sessionStorage may throw in private mode — ignore.
  }
}

/** True when subject/body differ from an empty normalized composer. */
export function replyComposerDraftHasContent(draft: {
  subject: string;
  bodyText: string;
  /** Normalized default subject for this parent (e.g. Re: …). */
  defaultSubject: string;
}): boolean {
  if (draft.bodyText.trim()) {
    return true;
  }
  return draft.subject.trim() !== draft.defaultSubject.trim();
}

/**
 * M-A: successful text-only send must clear the draft for the *scoped* actor+parent
 * that initiated the send — even if the composer has already unmounted.
 * Never clears a different message's key.
 */
export function shouldClearReplyComposerDraftAfterSend(input: {
  sendOk: boolean;
  sendStatus: string | null | undefined;
}): boolean {
  return input.sendOk === true && input.sendStatus === "sent";
}

/**
 * Non-reversible fingerprint of sent subject/body for clear-event matching.
 * Subject is trimmed (matches prior compare semantics); body is exact.
 * Browser-safe pure hash — never stores or returns plaintext content.
 */
export function fingerprintReplyComposerDraft(subject: string, bodyText: string): string {
  const normalized = `${subject.trim()}\u0000${bodyText}`;
  // FNV-1a 32-bit + length; collision risk is acceptable for same-tab ephemeral matching.
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1:${normalized.length}:${(hash >>> 0).toString(16)}`;
}

/** M4d-1 / R1: in-memory clear notification so remounted composers cannot re-persist a sent draft. */
export type ReplyComposerDraftClearedEvent = {
  actorId: string;
  parentMessageId: string;
  /** Fingerprint of submitted subject/body — never plaintext. */
  sentFingerprint: string;
  epoch: number;
};

type DraftClearedRecord = {
  epoch: number;
  sentFingerprint: string;
};

const draftClearedByKey = new Map<string, DraftClearedRecord>();
const draftClearedListeners = new Set<(event: ReplyComposerDraftClearedEvent) => void>();

export function getReplyComposerDraftClearedEpoch(
  actorId: string,
  parentMessageId: string,
): number {
  const key = buildReplyComposerDraftStorageKey(actorId, parentMessageId);
  if (!key) {
    return 0;
  }
  return draftClearedByKey.get(key)?.epoch ?? 0;
}

export function getReplyComposerDraftClearedRecord(
  actorId: string,
  parentMessageId: string,
): DraftClearedRecord | null {
  const key = buildReplyComposerDraftStorageKey(actorId, parentMessageId);
  if (!key) {
    return null;
  }
  return draftClearedByKey.get(key) ?? null;
}

export function subscribeReplyComposerDraftCleared(
  listener: (event: ReplyComposerDraftClearedEvent) => void,
): () => void {
  draftClearedListeners.add(listener);
  return () => {
    draftClearedListeners.delete(listener);
  };
}

/**
 * Whether a mounted composer should reset UI fields after a scoped send-clear.
 * Resets only when current fields still match the sent fingerprint (no newer edits).
 */
export function shouldResetComposerFieldsAfterScopedSendClear(input: {
  currentSubject: string;
  currentBodyText: string;
  sentFingerprint: string;
}): boolean {
  return (
    fingerprintReplyComposerDraft(input.currentSubject, input.currentBodyText) ===
    input.sentFingerprint
  );
}

/**
 * Whether persist should be suppressed after a newer send-clear for this scope.
 * Blocks re-writing the exact sent fingerprint; allows persisting newer user edits.
 */
export function shouldSuppressDraftPersistAfterSendClear(input: {
  seenClearEpoch: number;
  currentClearEpoch: number;
  currentSubject: string;
  currentBodyText: string;
  sentFingerprint: string;
}): boolean {
  if (input.currentClearEpoch <= input.seenClearEpoch) {
    return false;
  }
  return shouldResetComposerFieldsAfterScopedSendClear({
    currentSubject: input.currentSubject,
    currentBodyText: input.currentBodyText,
    sentFingerprint: input.sentFingerprint,
  });
}

/**
 * Clear only the draft key for the send scope. Safe no-op when store/key unavailable.
 * Notifies same-tab listeners so a remounted composer cannot resurrect the sent draft.
 * Returns whether a key was targeted (not whether the browser remove succeeded).
 */
export function clearScopedReplyComposerDraftAfterSend(input: {
  store: ReplyComposerDraftStore | null | undefined;
  /** Actor id captured at submit — never a later prop. */
  actorId: string;
  /** Parent message id captured at submit — never a later prop. */
  parentMessageId: string;
  sendOk: boolean;
  sendStatus: string | null | undefined;
  /** Exact subject/body submitted with the successful send (hashed immediately; not retained). */
  sentSubject?: string;
  sentBodyText?: string;
}): { cleared: boolean; key: string | null; epoch: number } {
  if (!shouldClearReplyComposerDraftAfterSend(input)) {
    return { cleared: false, key: null, epoch: 0 };
  }
  const key = buildReplyComposerDraftStorageKey(input.actorId, input.parentMessageId);
  if (!key) {
    return { cleared: false, key: null, epoch: 0 };
  }
  clearReplyComposerDraft(input.store, input.actorId, input.parentMessageId);

  const prev = draftClearedByKey.get(key);
  const epoch = (prev?.epoch ?? 0) + 1;
  const sentFingerprint = fingerprintReplyComposerDraft(
    input.sentSubject ?? "",
    input.sentBodyText ?? "",
  );
  draftClearedByKey.set(key, { epoch, sentFingerprint });

  const event: ReplyComposerDraftClearedEvent = {
    actorId: input.actorId,
    parentMessageId: input.parentMessageId,
    sentFingerprint,
    epoch,
  };
  for (const listener of draftClearedListeners) {
    try {
      listener(event);
    } catch {
      // Listener errors must not break send completion.
    }
  }

  return { cleared: true, key, epoch };
}

/** Test-only: reset in-memory clear registry between React tests. */
export function resetReplyComposerDraftClearRegistryForTests(): void {
  draftClearedByKey.clear();
  draftClearedListeners.clear();
}

/** Test-only: inspect registry record without exposing plaintext (fingerprint only). */
export function peekReplyComposerDraftClearedRecordForTests(
  actorId: string,
  parentMessageId: string,
): DraftClearedRecord | null {
  return getReplyComposerDraftClearedRecord(actorId, parentMessageId);
}
