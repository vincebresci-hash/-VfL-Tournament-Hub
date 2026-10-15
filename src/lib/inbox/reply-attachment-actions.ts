import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { requireAdminSession } from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { canAccessInbox, canReplyInbox } from "@/lib/inbox/access";
import {
  INBOX_REPLY_ATTACHMENT_BUCKET,
  INBOX_REPLY_ATTACHMENT_FINALIZE_MAX_AGE_MS,
  INBOX_REPLY_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
} from "@/lib/inbox/reply-attachment-config";
import {
  assertInboxReplyStoragePathBinding,
  decideFinalizeCommitCleanup,
} from "@/lib/inbox/reply-attachment-path";
import {
  isImageReplyAttachmentExtension,
  validateInboxReplyAttachmentBytes,
  validateInboxReplyAttachmentMeta,
} from "@/lib/inbox/reply-attachment-validation";
import { inboxFilenameExtension, sanitizeInboxFilename } from "@/lib/inbox/attachments-safe";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type InboxReplyUploadListItem = {
  id: string;
  parentMessageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  expiresAt: string;
};

/** Path-bound authorization for browser → Supabase Storage upload. */
export type InboxReplyDirectUploadAuthorization = {
  uploadId: string;
  bucket: typeof INBOX_REPLY_ATTACHMENT_BUCKET;
  /** Exact server-generated path; token is bound to this path only. */
  path: string;
  token: string;
  signedUrl: string;
  contentType: string;
  sizeBytes: number;
  /**
   * Server-enforced finalize deadline (epoch ms). Supabase signed-upload JWT
   * lifetime is platform-controlled and may outlive this; finalize still refuses.
   */
  finalizeDeadlineMs: number;
};

async function requireReplyAttachmentSession() {
  const access = await requireAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error as string, session: null, authorization: null };
  }
  if (!canAccessInbox(access.session, access.authorization)) {
    return {
      error: "Keine Berechtigung für den Posteingang.",
      session: null,
      authorization: null,
    };
  }
  if (!canReplyInbox(access.session, access.authorization)) {
    return {
      error: "Keine Berechtigung zum Antworten.",
      session: null,
      authorization: null,
    };
  }
  return { error: null, session: access.session, authorization: access.authorization };
}

function checksumSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function deleteStoragePath(path: string | null | undefined): Promise<boolean> {
  if (!path) {
    return true;
  }
  const service = createServiceRoleClient();
  const { error } = await service.storage.from(INBOX_REPLY_ATTACHMENT_BUCKET).remove([path]);
  return !error;
}

/** service_role-only path lookup (H3). */
async function getUploadStoragePath(uploadId: string): Promise<string | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("get_inbox_reply_upload_storage_path", {
    p_upload_id: uploadId,
  });
  if (error || typeof data !== "string" || !data) {
    return null;
  }
  return data;
}

/**
 * H1: reject is atomic for status=uploading only.
 * Delete Storage solely when reject returns true — never after a lost commit race.
 */
async function rejectUploadingAndDeleteStorage(
  uploadId: string,
  storagePath: string | null | undefined,
  errorCode: string,
): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data: rejected, error } = await service.rpc("reject_inbox_reply_upload", {
    p_upload_id: uploadId,
    p_error_code: errorCode,
  });
  if (error || rejected !== true) {
    return false;
  }
  if (storagePath) {
    await deleteStoragePath(storagePath);
  }
  return true;
}

function toUploadListItem(row: {
  id: string;
  parent_message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  expires_at: string;
}): InboxReplyUploadListItem {
  return {
    id: row.id,
    parentMessageId: row.parent_message_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function mapCreateUploadError(errorCode: string | null | undefined): {
  error: string;
  errorCode: string;
} {
  if (errorCode === "quota_count" || errorCode === "quota_bytes" || errorCode === "quota_actor_count") {
    return {
      error: "Anhang-Kontingent für diese Nachricht ist erschöpft.",
      errorCode: errorCode,
    };
  }
  if (errorCode === "not_authorized_reply" || errorCode === "not_authorized_view") {
    return { error: "Keine Berechtigung zum Antworten.", errorCode: errorCode };
  }
  if (errorCode === "size_rejected" || errorCode === "extension_blocked" || errorCode === "mime_blocked") {
    return { error: "Upload wurde abgelehnt.", errorCode: errorCode };
  }
  if (errorCode === "parent_not_found") {
    return { error: "Nachricht nicht gefunden.", errorCode: errorCode };
  }
  return {
    error: "Upload wurde abgelehnt.",
    errorCode: typeof errorCode === "string" ? errorCode : "rejected",
  };
}

/**
 * Begin direct browser → Supabase Storage upload.
 * Server creates the staging row + lease and issues a short-lived signed upload
 * token bound to the exact server-generated path. Never accepts client paths.
 * Bytes never transit Vercel on this step (avoids 4.5 MB / action body limits).
 */
export async function beginInboxReplyAttachmentUploadAction(input: {
  parentMessageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{
  ok: boolean;
  authorization: InboxReplyDirectUploadAuthorization | null;
  error: string | null;
  errorCode: string | null;
}> {
  const access = await requireReplyAttachmentSession();
  if (access.error || !access.session) {
    return {
      ok: false,
      authorization: null,
      error: access.error ?? "Nicht autorisiert.",
      errorCode: "unauthorized",
    };
  }

  const parentMessageId = String(input.parentMessageId ?? "").trim();
  if (!parentMessageId || !/^[0-9a-f-]{36}$/i.test(parentMessageId)) {
    return {
      ok: false,
      authorization: null,
      error: "Ungültige Upload-Angaben.",
      errorCode: "invalid_input",
    };
  }

  const validated = validateInboxReplyAttachmentMeta({
    filename: input.filename || "anhang",
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });
  if (!validated.ok) {
    return {
      ok: false,
      authorization: null,
      error: validated.message,
      errorCode: validated.code,
    };
  }

  const supabase = await createClient();
  const { data: parent, error: parentError } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("id", parentMessageId)
    .maybeSingle();
  if (parentError || !parent) {
    return {
      ok: false,
      authorization: null,
      error: "Nachricht nicht gefunden.",
      errorCode: "parent_not_found",
    };
  }

  const uploadId = randomUUID();
  const { data: createdRows, error: createError } = await supabase.rpc(
    "create_inbox_reply_upload",
    {
      p_parent_message_id: parentMessageId,
      p_upload_id: uploadId,
      p_filename: validated.filename,
      p_content_type: validated.contentType,
      p_size_bytes: validated.sizeBytes,
    },
  );

  if (createError) {
    return {
      ok: false,
      authorization: null,
      error: "Upload konnte nicht vorbereitet werden.",
      errorCode: "claim_failed",
    };
  }

  const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
  if (!created || created.error_code || !created.upload_id) {
    const mapped = mapCreateUploadError(
      typeof created?.error_code === "string" ? created.error_code : null,
    );
    return {
      ok: false,
      authorization: null,
      error: mapped.error,
      errorCode: mapped.errorCode,
    };
  }

  const service = createServiceRoleClient();
  const storagePath = await getUploadStoragePath(uploadId);
  if (!storagePath) {
    await rejectUploadingAndDeleteStorage(uploadId, null, "path_lookup_failed");
    return {
      ok: false,
      authorization: null,
      error: "Upload konnte nicht vorbereitet werden.",
      errorCode: "path_lookup_failed",
    };
  }

  // Structured path binding (never trust client path / never substring match).
  const actorId = access.session.user.id;
  if (
    !assertInboxReplyStoragePathBinding(storagePath, {
      parentMessageId,
      actorId,
      uploadId,
      filename: validated.filename,
    })
  ) {
    await rejectUploadingAndDeleteStorage(uploadId, storagePath, "path_binding_invalid");
    return {
      ok: false,
      authorization: null,
      error: "Upload-Pfad ungültig.",
      errorCode: "path_binding_invalid",
    };
  }

  const { data: leased, error: leaseError } = await service.rpc(
    "register_inbox_reply_upload_lease",
    {
      p_upload_id: uploadId,
      p_storage_path: storagePath,
      p_created_by: actorId,
    },
  );

  if (leaseError || leased !== true) {
    await rejectUploadingAndDeleteStorage(uploadId, storagePath, "lease_failed");
    return {
      ok: false,
      authorization: null,
      error: "Upload-Lease fehlgeschlagen.",
      errorCode: "lease_failed",
    };
  }

  const { data: signed, error: signError } = await service.storage
    .from(INBOX_REPLY_ATTACHMENT_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signError || !signed?.token || !signed?.signedUrl || !signed?.path) {
    await rejectUploadingAndDeleteStorage(uploadId, storagePath, "signed_upload_failed");
    return {
      ok: false,
      authorization: null,
      error: "Upload-Autorisierung fehlgeschlagen.",
      errorCode: "signed_upload_failed",
    };
  }

  // Defense in depth: never return a token for a path other than the leased one.
  if (signed.path !== storagePath) {
    await rejectUploadingAndDeleteStorage(uploadId, storagePath, "signed_path_mismatch");
    return {
      ok: false,
      authorization: null,
      error: "Upload-Autorisierung fehlgeschlagen.",
      errorCode: "signed_path_mismatch",
    };
  }

  const finalizeDeadlineMs = Date.now() + INBOX_REPLY_ATTACHMENT_FINALIZE_MAX_AGE_MS;

  return {
    ok: true,
    authorization: {
      uploadId,
      bucket: INBOX_REPLY_ATTACHMENT_BUCKET,
      path: storagePath,
      token: signed.token,
      signedUrl: signed.signedUrl,
      contentType: validated.contentType,
      sizeBytes: validated.sizeBytes,
      finalizeDeadlineMs,
    },
    error: null,
    errorCode: null,
  };
}

/**
 * After the browser uploads to the signed URL: download via service_role,
 * validate magic/MIME/size/checksum, then commit to staging.
 * H1: reject/delete only while status=uploading; concurrent losers never
 * destroy a successfully committed staging object.
 */
export async function finalizeInboxReplyAttachmentUploadAction(uploadId: string): Promise<{
  ok: boolean;
  upload: InboxReplyUploadListItem | null;
  error: string | null;
  errorCode: string | null;
}> {
  const access = await requireReplyAttachmentSession();
  if (access.error || !access.session) {
    return {
      ok: false,
      upload: null,
      error: access.error ?? "Nicht autorisiert.",
      errorCode: "unauthorized",
    };
  }

  const id = uploadId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return {
      ok: false,
      upload: null,
      error: "Ungültige Upload-ID.",
      errorCode: "invalid_input",
    };
  }

  const supabase = await createClient();
  const { data: meta, error: metaError } = await supabase
    .from("inbox_reply_uploads")
    .select(
      "id, parent_message_id, filename, content_type, size_bytes, status, created_by, created_at, expires_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (metaError || !meta) {
    return {
      ok: false,
      upload: null,
      error: "Upload nicht gefunden.",
      errorCode: "not_found",
    };
  }

  if (meta.created_by !== access.session.user.id) {
    return {
      ok: false,
      upload: null,
      error: "Keine Berechtigung.",
      errorCode: "forbidden",
    };
  }

  // Idempotent: already finalized by a concurrent winner or prior call.
  if (meta.status === "staging") {
    return {
      ok: true,
      upload: toUploadListItem(meta),
      error: null,
      errorCode: null,
    };
  }

  if (meta.status !== "uploading") {
    return {
      ok: false,
      upload: null,
      error: "Upload ist nicht mehr offen.",
      errorCode: "not_finalizable",
    };
  }

  const createdAtMs = new Date(meta.created_at).getTime();
  const expiredByTtl =
    (meta.expires_at && new Date(meta.expires_at).getTime() <= Date.now()) ||
    (!Number.isFinite(createdAtMs) ||
      Date.now() - createdAtMs > INBOX_REPLY_ATTACHMENT_FINALIZE_MAX_AGE_MS);

  if (expiredByTtl) {
    const expiredPath = await getUploadStoragePath(id);
    await rejectUploadingAndDeleteStorage(id, expiredPath, "upload_expired");
    return {
      ok: false,
      upload: null,
      error: "Upload-Autorisierung ist abgelaufen.",
      errorCode: "upload_expired",
    };
  }

  const service = createServiceRoleClient();
  const storagePath = await getUploadStoragePath(id);
  if (!storagePath) {
    await rejectUploadingAndDeleteStorage(id, null, "path_lookup_failed");
    return {
      ok: false,
      upload: null,
      error: "Upload-Pfad fehlt.",
      errorCode: "path_lookup_failed",
    };
  }

  if (
    !assertInboxReplyStoragePathBinding(storagePath, {
      parentMessageId: meta.parent_message_id,
      actorId: access.session.user.id,
      uploadId: id,
      filename: meta.filename,
    })
  ) {
    await rejectUploadingAndDeleteStorage(id, storagePath, "path_binding_invalid");
    return {
      ok: false,
      upload: null,
      error: "Upload-Pfad ungültig.",
      errorCode: "path_binding_invalid",
    };
  }

  // M3: download + byte length + checksum are authoritative (no list-metadata gate).
  const { data: blob, error: downloadError } = await service.storage
    .from(INBOX_REPLY_ATTACHMENT_BUCKET)
    .download(storagePath);

  if (downloadError || !blob) {
    await rejectUploadingAndDeleteStorage(id, storagePath, "object_missing_or_download_failed");
    return {
      ok: false,
      upload: null,
      error: "Hochgeladene Datei fehlt oder konnte nicht geprüft werden.",
      errorCode: "object_missing_or_download_failed",
    };
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  const validated = validateInboxReplyAttachmentBytes({
    filename: meta.filename,
    contentType: meta.content_type,
    content: bytes,
  });

  if (!validated.ok || validated.sizeBytes !== meta.size_bytes) {
    const code = validated.ok ? "size_mismatch" : validated.code;
    await rejectUploadingAndDeleteStorage(id, storagePath, code);
    return {
      ok: false,
      upload: null,
      error: validated.ok
        ? "Gespeicherte Dateigröße stimmt nicht überein."
        : validated.message,
      errorCode: code,
    };
  }

  const checksum = checksumSha256(bytes);
  const { data: committed, error: commitError } = await service.rpc(
    "commit_inbox_reply_upload",
    {
      p_upload_id: id,
      p_checksum_sha256: checksum,
      p_size_bytes: validated.sizeBytes,
    },
  );

  const { data: afterRow } = await supabase
    .from("inbox_reply_uploads")
    .select(
      "id, parent_message_id, filename, content_type, size_bytes, status, created_at, expires_at",
    )
    .eq("id", id)
    .maybeSingle();

  const cleanup = decideFinalizeCommitCleanup({
    commitOk: !commitError && committed === true,
    statusAfterCommit: afterRow?.status ?? null,
    commitErrorCode: "commit_failed",
  });

  if (cleanup.action === "success" || cleanup.action === "idempotent_staging") {
    if (!afterRow || (afterRow.status !== "staging" && afterRow.status !== "bound")) {
      return {
        ok: false,
        upload: null,
        error: "Upload-Metadaten nicht lesbar.",
        errorCode: "not_found",
      };
    }
    return {
      ok: true,
      upload: toUploadListItem(afterRow),
      error: null,
      errorCode: null,
    };
  }

  if (cleanup.action === "reject_and_delete_if_uploading") {
    await rejectUploadingAndDeleteStorage(id, storagePath, cleanup.errorCode);
    return {
      ok: false,
      upload: null,
      error: "Upload konnte nicht abgeschlossen werden.",
      errorCode: cleanup.errorCode,
    };
  }

  // abort_no_delete — another status; do not touch Storage.
  return {
    ok: false,
    upload: null,
    error: "Upload ist nicht mehr offen.",
    errorCode: cleanup.errorCode,
  };
}

/**
 * Phase 4c: list the current actor's staging uploads for a parent message.
 * Used to restore the composer attachment list after remount (cancel / message switch).
 *
 * Authorization (aligned with begin / inbound attachment download):
 * - Authenticated actor with inbox.view + inbox.reply
 * - Parent message must exist and remain visible under RLS (mailbox access)
 * - Rows scoped to created_by = actor and parent_message_id
 * Never returns storage_path or signed tokens.
 */
export async function listInboxReplyStagingAttachmentsAction(
  parentMessageId: string,
): Promise<{
  ok: boolean;
  uploads: InboxReplyUploadListItem[];
  error: string | null;
  errorCode: string | null;
}> {
  const access = await requireReplyAttachmentSession();
  if (access.error || !access.session) {
    return {
      ok: false,
      uploads: [],
      error: access.error ?? "Nicht autorisiert.",
      errorCode: "unauthorized",
    };
  }

  const parentId = parentMessageId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(parentId)) {
    return {
      ok: false,
      uploads: [],
      error: "Ungültige Nachrichten-ID.",
      errorCode: "invalid_input",
    };
  }

  const supabase = await createClient();

  // Same parent/mailbox visibility gate as beginInboxReplyAttachmentUploadAction:
  // inbox_messages SELECT is RLS-scoped to authorized mailbox access.
  const { data: parent, error: parentError } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("id", parentId)
    .maybeSingle();
  if (parentError || !parent) {
    return {
      ok: false,
      uploads: [],
      error: "Nachricht nicht gefunden.",
      errorCode: "parent_not_found",
    };
  }

  const { data, error } = await supabase
    .from("inbox_reply_uploads")
    .select(
      "id, parent_message_id, filename, content_type, size_bytes, status, created_at, expires_at",
    )
    .eq("parent_message_id", parentId)
    .eq("created_by", access.session.user.id)
    .eq("status", "staging")
    .order("created_at", { ascending: true });

  if (error) {
    return {
      ok: false,
      uploads: [],
      error: "Staging-Anhänge konnten nicht geladen werden.",
      errorCode: "list_failed",
    };
  }

  // Defense in depth: list item mapper never exposes storage_path / tokens.
  const uploads = (data ?? []).map((row) => toUploadListItem(row));
  return { ok: true, uploads, error: null, errorCode: null };
}

/**
 * Phase 4c H1: abandon only while server status is still `uploading`.
 * Uses atomic reject_inbox_reply_upload — no-op once staging/bound (race-safe).
 * Never deletes successfully finalized staging objects.
 */
export async function abandonUnfinishedInboxReplyAttachmentAction(
  uploadId: string,
): Promise<{
  ok: boolean;
  abandoned: boolean;
  error: string | null;
  errorCode: string | null;
}> {
  const access = await requireReplyAttachmentSession();
  if (access.error || !access.session) {
    return {
      ok: false,
      abandoned: false,
      error: access.error ?? "Nicht autorisiert.",
      errorCode: "unauthorized",
    };
  }

  const id = uploadId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return {
      ok: false,
      abandoned: false,
      error: "Ungültige Upload-ID.",
      errorCode: "invalid_input",
    };
  }

  const supabase = await createClient();
  const { data: meta, error: metaError } = await supabase
    .from("inbox_reply_uploads")
    .select("id, status, created_by")
    .eq("id", id)
    .maybeSingle();

  if (metaError || !meta) {
    // Already gone — treat as cleaned up.
    return { ok: true, abandoned: false, error: null, errorCode: "not_found" };
  }
  if (meta.created_by !== access.session.user.id) {
    return {
      ok: false,
      abandoned: false,
      error: "Keine Berechtigung.",
      errorCode: "forbidden",
    };
  }
  if (meta.status === "staging" || meta.status === "bound") {
    return {
      ok: true,
      abandoned: false,
      error: null,
      errorCode: "not_unfinished",
    };
  }
  if (meta.status !== "uploading") {
    return { ok: true, abandoned: false, error: null, errorCode: "not_unfinished" };
  }

  const storagePath = await getUploadStoragePath(id);
  const abandoned = await rejectUploadingAndDeleteStorage(id, storagePath, "abandoned_by_client");
  if (!abandoned) {
    // Lost the race to finalize — staging/bound must remain.
    return { ok: true, abandoned: false, error: null, errorCode: "not_unfinished" };
  }
  return { ok: true, abandoned: true, error: null, errorCode: null };
}

/**
 * Phase 4a: remove an unused staging upload owned by the actor.
 */
export async function removeInboxReplyAttachmentAction(uploadId: string): Promise<{
  ok: boolean;
  error: string | null;
  errorCode: string | null;
}> {
  const access = await requireReplyAttachmentSession();
  if (access.error || !access.session) {
    return {
      ok: false,
      error: access.error ?? "Nicht autorisiert.",
      errorCode: "unauthorized",
    };
  }

  const id = uploadId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: "Ungültige Upload-ID.", errorCode: "invalid_input" };
  }

  // Capture path via service_role before authenticated remove clears it (H3).
  const storagePath = await getUploadStoragePath(id);

  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("remove_inbox_reply_upload", {
    p_upload_id: id,
  });
  if (error) {
    return { ok: false, error: "Anhang konnte nicht entfernt werden.", errorCode: "remove_failed" };
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.ok) {
    return {
      ok: false,
      error:
        row?.error_code === "forbidden"
          ? "Keine Berechtigung."
          : "Anhang kann nicht entfernt werden.",
      errorCode: typeof row?.error_code === "string" ? row.error_code : "remove_failed",
    };
  }

  if (storagePath) {
    const deleted = await deleteStoragePath(storagePath);
    if (!deleted) {
      // Metadata already purged; storage GC can retry via orphan path if needed.
      return {
        ok: true,
        error: null,
        errorCode: "storage_delete_pending",
      };
    }
  }
  return { ok: true, error: null, errorCode: null };
}

async function authorizeUploadAccess(uploadId: string): Promise<{
  error: string | null;
  meta: {
    id: string;
    filename: string;
    content_type: string;
    status: string;
    created_by: string;
  } | null;
  storagePath: string | null;
}> {
  const access = await requireAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error as string, meta: null, storagePath: null };
  }
  if (!canAccessInbox(access.session, access.authorization)) {
    return { error: "Keine Berechtigung für den Posteingang.", meta: null, storagePath: null };
  }

  // Authenticated SELECT must not request storage_path (H3 column revoke).
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("inbox_reply_uploads")
    .select("id, filename, content_type, status, created_by")
    .eq("id", uploadId)
    .maybeSingle();

  if (error || !row) {
    return { error: "Anhang nicht gefunden.", meta: null, storagePath: null };
  }
  if (row.status === "purged" || row.status === "rejected") {
    return { error: "Anhang ist nicht verfügbar.", meta: null, storagePath: null };
  }

  const isOwner = row.created_by === access.session?.user.id;
  if (row.status === "staging" || row.status === "uploading") {
    if (!isOwner || !canReplyInbox(access.session, access.authorization)) {
      return { error: "Keine Berechtigung.", meta: null, storagePath: null };
    }
  } else if (row.status === "bound") {
    // Intentional: any inbox.view admin may preview/download bound reply attachments
    // for operational collaboration (not owner-only).
    if (!canAccessInbox(access.session, access.authorization)) {
      return { error: "Keine Berechtigung.", meta: null, storagePath: null };
    }
  } else {
    return { error: "Anhang ist nicht verfügbar.", meta: null, storagePath: null };
  }

  const storagePath = await getUploadStoragePath(uploadId);
  if (!storagePath) {
    return { error: "Anhang ist nicht verfügbar.", meta: null, storagePath: null };
  }

  return { error: null, meta: row, storagePath };
}

/**
 * Short-lived signed URL for image preview (owner staging / authorized bound).
 */
export async function createInboxReplyAttachmentPreviewUrlAction(uploadId: string): Promise<{
  url: string | null;
  filename: string | null;
  error: string | null;
}> {
  const id = uploadId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { url: null, filename: null, error: "Ungültige Upload-ID." };
  }

  const access = await authorizeUploadAccess(id);
  if (access.error || !access.meta || !access.storagePath) {
    return { url: null, filename: null, error: access.error ?? "Anhang nicht gefunden." };
  }

  const ext = inboxFilenameExtension(access.meta.filename);
  if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
    return {
      url: null,
      filename: null,
      error: "Vorschau ist nur für Bilder verfügbar.",
    };
  }
  if (!isImageReplyAttachmentExtension(ext)) {
    return { url: null, filename: null, error: "Vorschau ist nur für Bilder verfügbar." };
  }

  const service = createServiceRoleClient();
  const { data: signed, error: signError } = await service.storage
    .from(INBOX_REPLY_ATTACHMENT_BUCKET)
    .createSignedUrl(
      access.storagePath,
      INBOX_REPLY_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
    );

  if (signError || !signed?.signedUrl) {
    return { url: null, filename: null, error: "Vorschau-Link fehlgeschlagen." };
  }

  return {
    url: signed.signedUrl,
    filename: sanitizeInboxFilename(access.meta.filename),
    error: null,
  };
}

/**
 * Forced-download signed URL for an authorized staging/bound attachment.
 */
export async function createInboxReplyAttachmentDownloadUrlAction(uploadId: string): Promise<{
  url: string | null;
  filename: string | null;
  error: string | null;
}> {
  const id = uploadId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { url: null, filename: null, error: "Ungültige Upload-ID." };
  }

  const access = await authorizeUploadAccess(id);
  if (access.error || !access.meta || !access.storagePath) {
    return { url: null, filename: null, error: access.error ?? "Anhang nicht gefunden." };
  }

  const safeName = sanitizeInboxFilename(access.meta.filename);
  const service = createServiceRoleClient();
  const { data: signed, error: signError } = await service.storage
    .from(INBOX_REPLY_ATTACHMENT_BUCKET)
    .createSignedUrl(
      access.storagePath,
      INBOX_REPLY_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
      { download: safeName },
    );

  if (signError || !signed?.signedUrl) {
    return { url: null, filename: null, error: "Download-Link fehlgeschlagen." };
  }

  return { url: signed.signedUrl, filename: safeName, error: null };
}

/**
 * Protected cleanup: purge expired staging / retention-elapsed objects.
 * M3: only mark purged after Storage delete succeeds (retryable otherwise).
 */
export async function purgeExpiredInboxReplyAttachmentsAction(limit = 20): Promise<{
  ok: boolean;
  purged: number;
  error: string | null;
}> {
  const access = await requireAdminSession();
  if ("error" in access && access.error) {
    return { ok: false, purged: 0, error: access.error as string };
  }
  if (!access.session || !canManageSystem(access.session.user.role)) {
    return { ok: false, purged: 0, error: "Keine Berechtigung." };
  }

  const service = createServiceRoleClient();
  const { data: rows, error } = await service.rpc("list_purgeable_inbox_reply_uploads", {
    p_limit: Math.min(Math.max(limit, 1), 50),
  });
  if (error) {
    return { ok: false, purged: 0, error: "Cleanup-Liste fehlgeschlagen." };
  }

  let purged = 0;
  for (const row of rows ?? []) {
    const path = typeof row.storage_path === "string" ? row.storage_path : null;
    const uploadId = typeof row.upload_id === "string" ? row.upload_id : null;
    if (!path || !uploadId) {
      continue;
    }

    const { error: removeError } = await service.storage
      .from(INBOX_REPLY_ATTACHMENT_BUCKET)
      .remove([path]);
    if (removeError) {
      // Leave DB row eligible for a later retry (M3).
      continue;
    }

    const { data: marked } = await service.rpc("mark_inbox_reply_upload_purged", {
      p_upload_id: uploadId,
      p_reason: typeof row.reason === "string" ? row.reason : "purged",
    });
    if (marked === true) {
      purged += 1;
    }
    // If mark fails after delete, object is gone; list won't return it without path
    // unless path still set — mark retry on next run while path remains.
  }

  return { ok: true, purged, error: null };
}
