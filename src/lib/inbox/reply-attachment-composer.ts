/**
 * Phase 4c — pure helpers for the reply composer attachment UI.
 * Safe for client import. Never logs tokens, signed URLs, or storage paths.
 */

import { inboxFilenameExtension, sanitizeInboxFilename } from "@/lib/inbox/attachments-safe";
import {
  INBOX_REPLY_ATTACHMENT_EXTENSIONS,
  INBOX_REPLY_ATTACHMENT_MAX_COUNT,
  INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES,
  INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES,
  INBOX_REPLY_ATTACHMENT_MIME_BY_EXT,
  type InboxReplyAttachmentExtension,
} from "@/lib/inbox/reply-attachment-limits";
import { countsTowardClientQuota } from "@/lib/inbox/reply-attachment-lifecycle";
import { validateInboxReplyAttachmentMeta } from "@/lib/inbox/reply-attachment-validation";

export type ComposerAttachmentStatus =
  | "queued"
  | "authorizing"
  | "uploading"
  | "finalizing"
  | "staged"
  | "failed"
  | "removing";

export type ComposerAttachmentItem = {
  /** Stable React key; never a storage path or token. */
  localId: string;
  /** Parent message this row belongs to (stale-result guard). */
  parentMessageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: ComposerAttachmentStatus;
  uploadId: string | null;
  error: string | null;
  errorCode: string | null;
  /**
   * M4: server remove/abandon not confirmed yet — still counts toward client quota.
   */
  cleanupPending?: boolean;
};

const EXT_SET = new Set<string>(INBOX_REPLY_ATTACHMENT_EXTENSIONS);

function isAllowedExt(value: string): value is InboxReplyAttachmentExtension {
  return EXT_SET.has(value);
}

/** HTML accept list for the file picker. */
export const INBOX_REPLY_ATTACHMENT_ACCEPT = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".docx",
  ".xlsx",
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

export function formatInboxReplyAttachmentBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "—";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Prefer browser MIME when it matches the extension allowlist; otherwise use
 * the canonical MIME for the extension (browsers often omit OOXML types).
 */
export function resolveInboxReplyAttachmentContentType(
  filename: string,
  declaredMime: string | null | undefined,
): string | null {
  const safeName = sanitizeInboxFilename(filename);
  const ext = inboxFilenameExtension(safeName);
  if (!isAllowedExt(ext)) {
    return null;
  }
  const allowed = INBOX_REPLY_ATTACHMENT_MIME_BY_EXT[ext];
  const declared = (declaredMime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (declared && allowed.includes(declared)) {
    return declared;
  }
  return allowed[0] ?? null;
}

export function validateComposerAttachmentSelection(input: {
  filename: string;
  contentType: string | null | undefined;
  sizeBytes: number;
  existingCount: number;
  existingTotalBytes: number;
}):
  | { ok: true; filename: string; contentType: string; sizeBytes: number }
  | { ok: false; error: string; errorCode: string } {
  if (input.existingCount >= INBOX_REPLY_ATTACHMENT_MAX_COUNT) {
    return {
      ok: false,
      error: `Höchstens ${INBOX_REPLY_ATTACHMENT_MAX_COUNT} Anhänge pro Antwort.`,
      errorCode: "quota_count",
    };
  }

  const contentType = resolveInboxReplyAttachmentContentType(
    input.filename,
    input.contentType,
  );
  if (!contentType) {
    return {
      ok: false,
      error: "Dateityp ist nicht erlaubt (PDF, JPG, PNG, DOCX, XLSX).",
      errorCode: "extension_blocked",
    };
  }

  const meta = validateInboxReplyAttachmentMeta({
    filename: input.filename,
    contentType,
    sizeBytes: input.sizeBytes,
  });
  if (!meta.ok) {
    return { ok: false, error: meta.message, errorCode: meta.code };
  }

  if (input.existingTotalBytes + meta.sizeBytes > INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Gesamtgröße höchstens ${formatInboxReplyAttachmentBytes(INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES)}.`,
      errorCode: "quota_bytes",
    };
  }

  return {
    ok: true,
    filename: meta.filename,
    contentType: meta.contentType,
    sizeBytes: meta.sizeBytes,
  };
}

/** User-facing status label (German). */
export function composerAttachmentStatusLabel(status: ComposerAttachmentStatus): string {
  switch (status) {
    case "queued":
      return "Warteschlange";
    case "authorizing":
      return "Autorisierung…";
    case "uploading":
      return "Hochladen…";
    case "finalizing":
      return "Prüfen…";
    case "staged":
      return "Bereit";
    case "failed":
      return "Fehlgeschlagen";
    case "removing":
      return "Entfernen…";
    default:
      return "";
  }
}

export function mapComposerAttachmentError(
  errorCode: string | null | undefined,
  fallback: string | null | undefined,
): string {
  switch (errorCode) {
    case "quota_count":
      return `Höchstens ${INBOX_REPLY_ATTACHMENT_MAX_COUNT} Anhänge pro Antwort.`;
    case "quota_bytes":
      return `Gesamtgröße höchstens ${formatInboxReplyAttachmentBytes(INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES)}.`;
    case "quota_actor_count":
      return "Zu viele offene Uploads. Bitte warten oder vorhandene Anhänge entfernen.";
    case "size_rejected":
      return `Datei darf höchstens ${formatInboxReplyAttachmentBytes(INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES)} groß sein.`;
    case "extension_blocked":
    case "mime_blocked":
      return "Dateityp ist nicht erlaubt (PDF, JPG, PNG, DOCX, XLSX).";
    case "upload_expired":
      return "Upload-Autorisierung abgelaufen. Bitte Datei erneut hinzufügen.";
    case "object_missing_or_download_failed":
    case "storage_network_error":
      return "Upload fehlgeschlagen. Bitte erneut versuchen.";
    case "not_authorized_reply":
    case "unauthorized":
    case "forbidden":
      return "Keine Berechtigung für Anhänge.";
    case "attachments_runtime_budget":
      return "Anhangversand ist noch nicht freigeschaltet. Textantworten bleiben möglich.";
    case "cleanup_failed":
    case "remove_failed":
      return "Anhang konnte serverseitig nicht freigegeben werden. Bitte erneut entfernen.";
    case "not_unfinished":
      return "Fertige Anhänge werden nicht automatisch gelöscht.";
    default:
      return fallback?.trim() || "Anhang konnte nicht verarbeitet werden.";
  }
}

/** LOW: collect every rejected file in a multi-select, not only the last. */
export function formatComposerAttachmentValidationErrors(
  errors: ReadonlyArray<{ filename: string; error: string }>,
): string | null {
  if (!errors.length) {
    return null;
  }
  if (errors.length === 1) {
    return `${errors[0].filename}: ${errors[0].error}`;
  }
  return errors.map((entry) => `${entry.filename}: ${entry.error}`).join(" · ");
}

export function isComposerAttachmentPending(status: ComposerAttachmentStatus): boolean {
  return (
    status === "queued" ||
    status === "authorizing" ||
    status === "uploading" ||
    status === "finalizing" ||
    status === "removing"
  );
}

export function isComposerAttachmentFailed(status: ComposerAttachmentStatus): boolean {
  return status === "failed";
}

export function composerAttachmentsBlockSend(items: ReadonlyArray<ComposerAttachmentItem>): {
  blocked: boolean;
  reason: string | null;
} {
  if (items.length === 0) {
    return { blocked: false, reason: null };
  }
  if (items.some((item) => isComposerAttachmentPending(item.status))) {
    return {
      blocked: true,
      reason: "Bitte warten, bis alle Anhänge fertig hochgeladen sind.",
    };
  }
  if (items.some((item) => isComposerAttachmentFailed(item.status))) {
    return {
      blocked: true,
      reason: "Fehlerhafte Anhänge entfernen oder erneut versuchen.",
    };
  }
  // Product gate: UI may stage files, but SMTP attachment send stays closed.
  return {
    blocked: true,
    reason:
      "Anhangversand ist noch nicht freigeschaltet. Entfernen Sie Anhänge, um eine Textantwort zu senden.",
  };
}

export function sumComposerAttachmentBytes(
  items: ReadonlyArray<
    Pick<ComposerAttachmentItem, "sizeBytes" | "status" | "uploadId" | "cleanupPending">
  >,
): number {
  return items
    .filter((item) =>
      countsTowardClientQuota({
        status: item.status,
        uploadId: item.uploadId,
        cleanupPending: item.cleanupPending,
      }),
    )
    .reduce((sum, item) => sum + item.sizeBytes, 0);
}

export function countActiveComposerAttachments(
  items: ReadonlyArray<
    Pick<ComposerAttachmentItem, "status" | "uploadId" | "cleanupPending">
  >,
): number {
  return items.filter((item) =>
    countsTowardClientQuota({
      status: item.status,
      uploadId: item.uploadId,
      cleanupPending: item.cleanupPending,
    }),
  ).length;
}

/** M1: step indicator only — not byte-complete percent. */
export function composerAttachmentStepIndex(status: ComposerAttachmentStatus): {
  step: number;
  totalSteps: number;
  label: string;
} {
  const totalSteps = 4;
  switch (status) {
    case "queued":
      return { step: 1, totalSteps, label: composerAttachmentStatusLabel(status) };
    case "authorizing":
      return { step: 1, totalSteps, label: composerAttachmentStatusLabel(status) };
    case "uploading":
      return { step: 2, totalSteps, label: composerAttachmentStatusLabel(status) };
    case "finalizing":
      return { step: 3, totalSteps, label: composerAttachmentStatusLabel(status) };
    case "staged":
      return { step: 4, totalSteps, label: composerAttachmentStatusLabel(status) };
    case "failed":
    case "removing":
      return { step: 0, totalSteps, label: composerAttachmentStatusLabel(status) };
    default:
      return { step: 0, totalSteps, label: "" };
  }
}

export function createComposerAttachmentLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
