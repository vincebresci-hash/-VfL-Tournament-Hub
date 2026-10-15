/**
 * Session-scoped reply draft persistence (subject + body only).
 * Keyed by authenticated actor + parent message so drafts never leak across users/messages.
 * Never stores upload tokens, storage paths, credentials, or attachment metadata.
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
