/**
 * Structured storage-path binding for outbound reply attachments.
 * Path layout (server-generated): mailboxId/parentMessageId/actorId/uploadId/filename
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InboxReplyStoragePathParts = {
  mailboxId: string;
  parentMessageId: string;
  actorId: string;
  uploadId: string;
  filename: string;
};

export function parseInboxReplyStoragePath(
  storagePath: string,
): InboxReplyStoragePathParts | null {
  if (!storagePath || storagePath.includes("\\") || storagePath.includes("..")) {
    return null;
  }
  const parts = storagePath.split("/");
  if (parts.length !== 5) {
    return null;
  }
  const [mailboxId, parentMessageId, actorId, uploadId, filename] = parts;
  if (
    !mailboxId ||
    !parentMessageId ||
    !actorId ||
    !uploadId ||
    !filename ||
    !UUID_RE.test(mailboxId) ||
    !UUID_RE.test(parentMessageId) ||
    !UUID_RE.test(actorId) ||
    !UUID_RE.test(uploadId) ||
    filename.includes("/") ||
    filename.length === 0 ||
    filename.length > 180
  ) {
    return null;
  }
  return { mailboxId, parentMessageId, actorId, uploadId, filename };
}

/** Exact segment equality — never substring matching. */
export function assertInboxReplyStoragePathBinding(
  storagePath: string,
  expected: {
    parentMessageId: string;
    actorId: string;
    uploadId: string;
    filename?: string;
  },
): boolean {
  const parsed = parseInboxReplyStoragePath(storagePath);
  if (!parsed) {
    return false;
  }
  if (parsed.parentMessageId.toLowerCase() !== expected.parentMessageId.toLowerCase()) {
    return false;
  }
  if (parsed.actorId.toLowerCase() !== expected.actorId.toLowerCase()) {
    return false;
  }
  if (parsed.uploadId.toLowerCase() !== expected.uploadId.toLowerCase()) {
    return false;
  }
  if (
    expected.filename != null &&
    parsed.filename !== expected.filename
  ) {
    return false;
  }
  return true;
}

/**
 * H1 cleanup decision after commit attempt.
 * Storage delete is only safe when reject can still win on status=uploading.
 */
export type FinalizeCommitCleanupDecision =
  | { action: "success" }
  | { action: "idempotent_staging" }
  | { action: "reject_and_delete_if_uploading"; errorCode: string }
  | { action: "abort_no_delete"; errorCode: string };

export function decideFinalizeCommitCleanup(input: {
  commitOk: boolean;
  statusAfterCommit: string | null | undefined;
  commitErrorCode?: string;
}): FinalizeCommitCleanupDecision {
  if (input.commitOk) {
    return { action: "success" };
  }
  if (input.statusAfterCommit === "staging" || input.statusAfterCommit === "bound") {
    return { action: "idempotent_staging" };
  }
  if (input.statusAfterCommit === "uploading" || input.statusAfterCommit == null) {
    return {
      action: "reject_and_delete_if_uploading",
      errorCode: input.commitErrorCode ?? "commit_failed",
    };
  }
  return {
    action: "abort_no_delete",
    errorCode: input.commitErrorCode ?? "not_finalizable",
  };
}
