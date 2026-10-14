import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { requireAdminSession } from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { canAccessInbox, canReplyInbox } from "@/lib/inbox/access";
import {
  INBOX_REPLY_ATTACHMENT_BUCKET,
  INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES,
  INBOX_REPLY_ATTACHMENT_SIGNED_URL_TTL_SECONDS,
} from "@/lib/inbox/reply-attachment-config";
import {
  assertReplyAttachmentDeclaredSize,
  isImageReplyAttachmentExtension,
  validateInboxReplyAttachmentBytes,
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
 * M4/M5: confirm object exists and size matches declared size_bytes.
 * Uses folder list metadata (no full download).
 */
async function verifyStoredObjectSize(
  storagePath: string,
  expectedSize: number,
): Promise<boolean> {
  const service = createServiceRoleClient();
  const parts = storagePath.split("/");
  const name = parts.pop();
  const folder = parts.join("/");
  if (!name || !folder) {
    return false;
  }
  const { data, error } = await service.storage
    .from(INBOX_REPLY_ATTACHMENT_BUCKET)
    .list(folder, { search: name, limit: 20 });
  if (error || !data?.length) {
    return false;
  }
  const match = data.find((entry) => entry.name === name);
  if (!match) {
    return false;
  }
  const metaSize = match.metadata?.size;
  const size = typeof metaSize === "number" ? metaSize : null;
  return size === expectedSize;
}

/**
 * Phase 4a: stage one outbound reply attachment in private storage.
 * Client sends FormData bytes — never filesystem paths.
 * Does not bind to a reply or invoke SMTP (Phase 4b).
 *
 * Resource notes (H4): reject on File.size before buffering. Next/Vercel still
 * enforce platform body limits; oversized bodies may fail at the edge before
 * this action runs. Keep caps at 5 MiB/file.
 */
export async function uploadInboxReplyAttachmentAction(formData: FormData): Promise<{
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

  const parentMessageId = String(formData.get("parentMessageId") ?? "").trim();
  const file = formData.get("file");
  if (!parentMessageId || !(file instanceof File)) {
    return {
      ok: false,
      upload: null,
      error: "Ungültige Upload-Angaben.",
      errorCode: "invalid_input",
    };
  }

  // H4: reject oversized uploads before buffering into memory.
  const declared = assertReplyAttachmentDeclaredSize(file.size);
  if (!declared.ok) {
    return {
      ok: false,
      upload: null,
      error: declared.message,
      errorCode: declared.code,
    };
  }
  if (file.size > INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES) {
    return {
      ok: false,
      upload: null,
      error: `Datei darf höchstens ${INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES} Bytes haben.`,
      errorCode: "size_rejected",
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
      upload: null,
      error: "Nachricht nicht gefunden.",
      errorCode: "parent_not_found",
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const validated = validateInboxReplyAttachmentBytes({
    filename: file.name || "anhang",
    contentType: file.type || null,
    content: bytes,
  });
  if (!validated.ok) {
    return {
      ok: false,
      upload: null,
      error: validated.message,
      errorCode: validated.code,
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
      upload: null,
      error: "Upload konnte nicht vorbereitet werden.",
      errorCode: "claim_failed",
    };
  }

  const created = Array.isArray(createdRows) ? createdRows[0] : createdRows;
  if (!created || created.error_code || !created.upload_id) {
    return {
      ok: false,
      upload: null,
      error:
        created?.error_code === "quota_count" || created?.error_code === "quota_bytes"
          ? "Anhang-Kontingent für diese Nachricht ist erschöpft."
          : created?.error_code === "not_authorized_reply"
            ? "Keine Berechtigung zum Antworten."
            : "Upload wurde abgelehnt.",
      errorCode: typeof created?.error_code === "string" ? created.error_code : "rejected",
    };
  }

  const service = createServiceRoleClient();
  const storagePath = await getUploadStoragePath(uploadId);
  if (!storagePath) {
    await service.rpc("reject_inbox_reply_upload", {
      p_upload_id: uploadId,
      p_error_code: "path_lookup_failed",
    });
    return {
      ok: false,
      upload: null,
      error: "Upload konnte nicht vorbereitet werden.",
      errorCode: "path_lookup_failed",
    };
  }

  const { data: leased, error: leaseError } = await service.rpc(
    "register_inbox_reply_upload_lease",
    {
      p_upload_id: uploadId,
      p_storage_path: storagePath,
      p_created_by: access.session.user.id,
    },
  );

  if (leaseError || leased !== true) {
    await service.rpc("reject_inbox_reply_upload", {
      p_upload_id: uploadId,
      p_error_code: "lease_failed",
    });
    return {
      ok: false,
      upload: null,
      error: "Upload-Lease fehlgeschlagen.",
      errorCode: "lease_failed",
    };
  }

  const { error: uploadError } = await service.storage
    .from(INBOX_REPLY_ATTACHMENT_BUCKET)
    .upload(storagePath, bytes, {
      contentType: validated.contentType,
      upsert: false,
    });

  if (uploadError) {
    await service.rpc("reject_inbox_reply_upload", {
      p_upload_id: uploadId,
      p_error_code: "storage_upload_failed",
    });
    await deleteStoragePath(storagePath);
    return {
      ok: false,
      upload: null,
      error: "Datei konnte nicht gespeichert werden.",
      errorCode: "storage_upload_failed",
    };
  }

  // M4/M5: object must exist and size must match before commit.
  const sizeOk = await verifyStoredObjectSize(storagePath, validated.sizeBytes);
  if (!sizeOk) {
    await service.rpc("reject_inbox_reply_upload", {
      p_upload_id: uploadId,
      p_error_code: "size_mismatch",
    });
    await deleteStoragePath(storagePath);
    return {
      ok: false,
      upload: null,
      error: "Gespeicherte Dateigröße stimmt nicht überein.",
      errorCode: "size_mismatch",
    };
  }

  const checksum = checksumSha256(bytes);
  const { data: committed, error: commitError } = await service.rpc(
    "commit_inbox_reply_upload",
    {
      p_upload_id: uploadId,
      p_checksum_sha256: checksum,
      p_size_bytes: validated.sizeBytes,
    },
  );

  if (commitError || committed !== true) {
    await service.rpc("reject_inbox_reply_upload", {
      p_upload_id: uploadId,
      p_error_code: "commit_failed",
    });
    await deleteStoragePath(storagePath);
    return {
      ok: false,
      upload: null,
      error: "Upload konnte nicht abgeschlossen werden.",
      errorCode: "commit_failed",
    };
  }

  const { data: row } = await supabase
    .from("inbox_reply_uploads")
    .select(
      "id, parent_message_id, filename, content_type, size_bytes, status, created_at, expires_at",
    )
    .eq("id", uploadId)
    .maybeSingle();

  if (!row) {
    return {
      ok: false,
      upload: null,
      error: "Upload-Metadaten nicht lesbar.",
      errorCode: "not_found",
    };
  }

  return {
    ok: true,
    upload: {
      id: row.id,
      parentMessageId: row.parent_message_id,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    },
    error: null,
    errorCode: null,
  };
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
