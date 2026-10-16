/**
 * Phase 4c lifecycle decisions for attachment UI cleanup.
 * Pure helpers — safe for client + node:test. No tokens/paths.
 */

export type ServerUploadStatus =
  | "uploading"
  | "staging"
  | "bound"
  | "purged"
  | "rejected"
  | string;

export type ComposerUiUploadStatus =
  | "queued"
  | "authorizing"
  | "uploading"
  | "finalizing"
  | "staged"
  | "failed"
  | "removing";

/**
 * H1: automatic cleanup may only target unfinished server rows.
 * `staging` / `bound` must survive unmount, message switch, and stale async completion.
 */
export function isUnfinishedServerUploadStatus(status: ServerUploadStatus | null | undefined): boolean {
  return status === "uploading";
}

export function isPreservedServerUploadStatus(status: ServerUploadStatus | null | undefined): boolean {
  return status === "staging" || status === "bound";
}

/**
 * UI statuses that may still map to an unfinished server `uploading` row.
 * `finalizing` is included so we *attempt* abandon — server reject is a no-op once staging.
 */
export function uiStatusMayNeedAutoAbandon(status: ComposerUiUploadStatus): boolean {
  return (
    status === "queued" ||
    status === "authorizing" ||
    status === "uploading" ||
    status === "finalizing"
  );
}

export type StaleFinalizeDecision =
  | { action: "ignore_ui_only" }
  | { action: "abandon_if_still_uploading" };

/**
 * After finalize returns: if the composer generation is stale, never delete a
 * successful staging/bound commit — only ignore the UI update.
 */
export function decideStaleFinalizeOutcome(input: {
  finalizeOk: boolean;
  serverStatusAfter?: ServerUploadStatus | null;
}): StaleFinalizeDecision {
  if (input.finalizeOk) {
    return { action: "ignore_ui_only" };
  }
  if (isPreservedServerUploadStatus(input.serverStatusAfter ?? null)) {
    return { action: "ignore_ui_only" };
  }
  return { action: "abandon_if_still_uploading" };
}

export type UnmountCleanupDecision =
  | { action: "skip" }
  | { action: "abandon_if_still_uploading" };

/**
 * Unmount / message-switch cleanup: never auto-remove staged/bound.
 * Failed rows with an uploadId may still be `uploading` on the server — abandon attempt is OK
 * (reject no-ops if already rejected/purged/staging).
 */
export function decideUnmountAutoCleanup(input: {
  uiStatus: ComposerUiUploadStatus;
  uploadId: string | null;
}): UnmountCleanupDecision {
  if (!input.uploadId) {
    return { action: "skip" };
  }
  if (input.uiStatus === "staged" || input.uiStatus === "removing") {
    return { action: "skip" };
  }
  if (uiStatusMayNeedAutoAbandon(input.uiStatus) || input.uiStatus === "failed") {
    return { action: "abandon_if_still_uploading" };
  }
  return { action: "skip" };
}

/** Rows that still consume client-side attachment quota slots. */
export function countsTowardClientQuota(input: {
  status: ComposerUiUploadStatus;
  uploadId: string | null;
  cleanupPending?: boolean;
}): boolean {
  if (input.status === "removing") {
    return true;
  }
  if (input.status === "failed") {
    // M4: unresolved server ids still occupy quota until remove/abandon succeeds.
    return Boolean(input.uploadId) || input.cleanupPending === true;
  }
  return true;
}

export type ListStagingAccessDecision =
  | { ok: true }
  | {
      ok: false;
      errorCode: "unauthorized" | "invalid_input" | "parent_not_found";
    };

/**
 * M-C: single shared authorization decision for listInboxReplyStagingAttachmentsAction
 * and its negative tests. Fail closed on missing auth, inbox.view, inbox.reply,
 * invalid parent id, or RLS-invisible parent/mailbox.
 */
export function decideListStagingAccess(input: {
  authenticated: boolean;
  canAccessInbox: boolean;
  canReplyInbox: boolean;
  parentMessageId: string;
  /** Result of RLS-scoped inbox_messages lookup (false = inaccessible / missing). */
  parentVisible: boolean;
}): ListStagingAccessDecision {
  if (!input.authenticated || !input.canAccessInbox || !input.canReplyInbox) {
    return { ok: false, errorCode: "unauthorized" };
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(input.parentMessageId ?? "").trim())) {
    return { ok: false, errorCode: "invalid_input" };
  }
  if (!input.parentVisible) {
    return { ok: false, errorCode: "parent_not_found" };
  }
  return { ok: true };
}

/** @deprecated Use decideListStagingAccess — kept as thin alias for older tests. */
export function decideListStagingParentAccess(input: {
  authenticated: boolean;
  parentMessageId: string;
  parentVisible: boolean;
}): ListStagingAccessDecision {
  return decideListStagingAccess({
    authenticated: input.authenticated,
    canAccessInbox: input.authenticated,
    canReplyInbox: input.authenticated,
    parentMessageId: input.parentMessageId,
    parentVisible: input.parentVisible,
  });
}

export type RemoveAfterAbandonDecision =
  | { action: "drop_from_ui" }
  | { action: "continue_explicit_staging_remove" }
  | { action: "reconcile_as_staged" }
  | { action: "keep_with_error"; errorCode: string };

/**
 * M2: remove clicked while upload was still in flight (uploading/finalizing).
 * Abandon is uploading-only; if finalize won (`not_unfinished`), never silently hide —
 * either continue with explicit staging remove or reconcile UI to staged.
 */
export function decideRemoveAfterAbandon(input: {
  abandonOk: boolean;
  abandoned: boolean;
  errorCode: string | null | undefined;
}): RemoveAfterAbandonDecision {
  if (input.abandoned) {
    return { action: "drop_from_ui" };
  }
  if (input.errorCode === "not_found") {
    return { action: "drop_from_ui" };
  }
  if (input.errorCode === "not_unfinished") {
    // Server row is staging/bound — preserve explicit Entfernen via staging remove.
    return { action: "continue_explicit_staging_remove" };
  }
  if (!input.abandonOk) {
    return {
      action: "keep_with_error",
      errorCode: typeof input.errorCode === "string" && input.errorCode
        ? input.errorCode
        : "cleanup_failed",
    };
  }
  // Inconclusive success without abandon — do not hide a possible staged object.
  return { action: "reconcile_as_staged" };
}

/**
 * After explicit staging remove during the remove/finalize race.
 * Failed remove must restore a visible staged row (never silent hide).
 */
export function decideRemoveAfterStagingRemove(input: {
  removeOk: boolean;
  errorCode?: string | null;
}): { action: "drop_from_ui" } | { action: "reconcile_as_staged"; errorCode: string } {
  if (input.removeOk) {
    return { action: "drop_from_ui" };
  }
  return {
    action: "reconcile_as_staged",
    errorCode:
      typeof input.errorCode === "string" && input.errorCode
        ? input.errorCode
        : "remove_failed",
  };
}
