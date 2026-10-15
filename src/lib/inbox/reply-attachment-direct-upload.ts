/**
 * Browser-side helper for Phase 4 direct-to-Supabase reply attachment uploads.
 * Safe to import from client components — no privileged server credentials.
 *
 * Flow:
 * 1. Server: beginInboxReplyAttachmentUploadAction(meta) → authorization
 * 2. Browser: uploadInboxReplyAttachmentToSignedUrl(authorization, file)
 * 3. Server: finalizeInboxReplyAttachmentUploadAction(uploadId)
 *
 * Composer UI must stay unwired until product approval.
 */

export const INBOX_REPLY_ATTACHMENT_DIRECT_UPLOAD_BUCKET = "inbox-reply-attachments" as const;

/** Mirrors server authorization payload without importing privileged server modules. */
export type InboxReplyDirectUploadClientAuthorization = {
  uploadId: string;
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
  contentType: string;
  sizeBytes: number;
  /** Server-enforced finalize deadline (epoch ms). */
  finalizeDeadlineMs: number;
};

export type InboxReplyDirectUploadClientResult =
  | { ok: true }
  | { ok: false; error: string; errorCode: string };

/**
 * Reject client attempts to swap path/token against a different authorization.
 */
export function assertDirectUploadAuthorizationBinding(
  authorization: Pick<
    InboxReplyDirectUploadClientAuthorization,
    "path" | "token" | "uploadId" | "bucket"
  >,
  expectedUploadId: string,
): InboxReplyDirectUploadClientResult {
  if (!authorization.uploadId || authorization.uploadId !== expectedUploadId) {
    return { ok: false, error: "Upload-ID stimmt nicht.", errorCode: "upload_id_mismatch" };
  }
  if (!authorization.token || !authorization.path) {
    return { ok: false, error: "Upload-Token fehlt.", errorCode: "missing_token" };
  }
  if (authorization.bucket !== INBOX_REPLY_ATTACHMENT_DIRECT_UPLOAD_BUCKET) {
    return { ok: false, error: "Ungültiger Storage-Bucket.", errorCode: "bucket_mismatch" };
  }
  // Path must include the upload id segment (server-generated layout).
  if (!authorization.path.includes(`/${authorization.uploadId}/`)) {
    return { ok: false, error: "Upload-Pfad ungültig.", errorCode: "path_tampered" };
  }
  return { ok: true };
}

/**
 * PUT file bytes to the signed upload URL (no Supabase JS client required).
 * Uses the exact path+token from server authorization — never a client path.
 */
export async function uploadInboxReplyAttachmentToSignedUrl(
  authorization: InboxReplyDirectUploadClientAuthorization,
  file: Blob,
): Promise<InboxReplyDirectUploadClientResult> {
  const binding = assertDirectUploadAuthorizationBinding(authorization, authorization.uploadId);
  if (!binding.ok) {
    return binding;
  }

  if (typeof file.size === "number" && file.size !== authorization.sizeBytes) {
    return {
      ok: false,
      error: "Dateigröße stimmt nicht mit der Autorisierung überein.",
      errorCode: "size_mismatch",
    };
  }

  try {
    const response = await fetch(authorization.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": authorization.contentType,
      },
      body: file,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "Direkt-Upload zu Storage fehlgeschlagen.",
        errorCode: `storage_http_${response.status}`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Direkt-Upload zu Storage fehlgeschlagen.",
      errorCode: "storage_network_error",
    };
  }
}
