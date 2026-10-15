"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import {
  canAccessInbox,
  canManageInbox,
  canTriggerInboxSync,
} from "@/lib/inbox/access";
import { sanitizeInboxFilename } from "@/lib/inbox/attachments-safe";
import { INBOX_ATTACHMENT_BUCKET, INBOX_SIGNED_URL_TTL_SECONDS } from "@/lib/inbox/config";
import { getInboxMessageDetail } from "@/lib/inbox/queries";
import { sendInboxReplyAction as sendInboxReplyActionImpl } from "@/lib/inbox/reply-send-action";
import type { SendInboxReplyInput, SendInboxReplyResult } from "@/lib/inbox/reply-send";
import {
  beginInboxReplyAttachmentUploadAction as beginInboxReplyAttachmentUploadActionImpl,
  createInboxReplyAttachmentDownloadUrlAction as createInboxReplyAttachmentDownloadUrlActionImpl,
  createInboxReplyAttachmentPreviewUrlAction as createInboxReplyAttachmentPreviewUrlActionImpl,
  finalizeInboxReplyAttachmentUploadAction as finalizeInboxReplyAttachmentUploadActionImpl,
  purgeExpiredInboxReplyAttachmentsAction as purgeExpiredInboxReplyAttachmentsActionImpl,
  removeInboxReplyAttachmentAction as removeInboxReplyAttachmentActionImpl,
} from "@/lib/inbox/reply-attachment-actions";
import { runInboxSyncBatch } from "@/lib/inbox/sync";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { InboxMessageDetail, InboxProcessingStatus } from "@/lib/inbox/types";

/**
 * Phase 2: send an IONOS SMTP reply for an inbox message.
 * Auth: admin session + inbox.view + inbox.reply.
 * Claim: authenticated RPC. Finalize: service_role only. Never Resend.
 * Phase 4a: still rejects attachment payloads until Phase 4b bind/SMTP.
 */
export async function sendInboxReplyAction(
  input: SendInboxReplyInput,
): Promise<SendInboxReplyResult> {
  return sendInboxReplyActionImpl(input);
}

/**
 * Phase 4a/4b: issue short-lived direct-to-Supabase upload authorization.
 * Client uploads bytes with the returned token; then call finalize.
 */
export async function beginInboxReplyAttachmentUploadAction(input: {
  parentMessageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}) {
  return beginInboxReplyAttachmentUploadActionImpl(input);
}

/** Phase 4a/4b: verify Storage object and promote to staging (no SMTP). */
export async function finalizeInboxReplyAttachmentUploadAction(uploadId: string) {
  return finalizeInboxReplyAttachmentUploadActionImpl(uploadId);
}

/** Phase 4a: remove unused staging upload. */
export async function removeInboxReplyAttachmentAction(uploadId: string) {
  return removeInboxReplyAttachmentActionImpl(uploadId);
}

/** Phase 4a: short-lived image preview URL. */
export async function createInboxReplyAttachmentPreviewUrlAction(uploadId: string) {
  return createInboxReplyAttachmentPreviewUrlActionImpl(uploadId);
}

/** Phase 4a: forced-download signed URL. */
export async function createInboxReplyAttachmentDownloadUrlAction(uploadId: string) {
  return createInboxReplyAttachmentDownloadUrlActionImpl(uploadId);
}

/** Phase 4a: SUPER_ADMIN-triggered purge of expired staging / retention-elapsed objects. */
export async function purgeExpiredInboxReplyAttachmentsAction(limit?: number) {
  return purgeExpiredInboxReplyAttachmentsActionImpl(limit);
}

async function requireInboxSession() {
  const access = await requireAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error as string, session: null, authorization: null };
  }
  if (!canAccessInbox(access.session, access.authorization)) {
    return { error: "Keine Berechtigung für den Posteingang.", session: null, authorization: null };
  }
  return { error: null, session: access.session, authorization: access.authorization };
}

export async function updateInboxMessageLocalStateAction(input: {
  messageId: string;
  isUnreadLocal?: boolean;
  processingStatus?: InboxProcessingStatus;
}): Promise<{ ok: boolean; error: string | null }> {
  const access = await requireInboxSession();
  if (access.error || !access.session || !access.authorization) {
    return { ok: false, error: access.error ?? "Nicht autorisiert." };
  }
  if (!canManageInbox(access.session, access.authorization)) {
    return { ok: false, error: "Keine Berechtigung zum Bearbeiten." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_inbox_message_local_state", {
    p_message_id: input.messageId,
    p_is_unread_local: input.isUnreadLocal ?? null,
    p_processing_status: input.processingStatus ?? null,
  });

  if (error || !data) {
    return { ok: false, error: "Status konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/posteingang");
  revalidatePath(`/admin/posteingang/${input.messageId}`);
  revalidatePath("/admin", "layout");
  return { ok: true, error: null };
}

export async function markInboxMessageReadAction(messageId: string) {
  return updateInboxMessageLocalStateAction({
    messageId,
    isUnreadLocal: false,
  });
}

const INBOX_MESSAGE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Read-only detail fetch for the two-pane workspace.
 * Auth: same gate as the detail route (admin session + inbox.view via canAccessInbox).
 * Data: same getInboxMessageDetail() user-scoped Supabase client (RLS) + re-sanitize.
 * Does not run IMAP sync.
 */
export async function getInboxMessageDetailAction(messageId: string): Promise<{
  message: InboxMessageDetail | null;
  error: string | null;
}> {
  const access = await requireInboxSession();
  if (access.error || !access.session) {
    return { message: null, error: access.error ?? "Nicht autorisiert." };
  }
  if (!INBOX_MESSAGE_ID_RE.test(messageId.trim())) {
    return { message: null, error: "Ungültige Nachrichten-ID." };
  }

  const { message, ready } = await getInboxMessageDetail(messageId.trim());
  if (!ready) {
    return { message: null, error: "Posteingang ist noch nicht bereit." };
  }
  if (!message) {
    return { message: null, error: "Nachricht nicht gefunden." };
  }
  return { message, error: null };
}

export async function triggerInboxSyncAction(): Promise<{
  ok: boolean;
  error: string | null;
  result?: Awaited<ReturnType<typeof runInboxSyncBatch>>;
}> {
  const access = await requireAdminSession();
  if ("error" in access && access.error) {
    return { ok: false, error: access.error };
  }
  if (!canTriggerInboxSync(access.session, access.authorization)) {
    return { ok: false, error: "Nur Super-Admins dürfen die Synchronisation starten." };
  }

  try {
    const result = await runInboxSyncBatch();
    revalidatePath("/admin/posteingang");
    revalidatePath("/admin", "layout");
    return { ok: !result.error, error: result.error, result };
  } catch {
    return { ok: false, error: "Synchronisation fehlgeschlagen." };
  }
}

export async function createInboxAttachmentDownloadUrlAction(attachmentId: string): Promise<{
  url: string | null;
  filename: string | null;
  error: string | null;
}> {
  const access = await requireInboxSession();
  if (access.error || !access.session) {
    return { url: null, filename: null, error: access.error ?? "Nicht autorisiert." };
  }

  const supabase = await createClient();
  const { data: attachment, error } = await supabase
    .from("inbox_attachments")
    .select("id, storage_path, stored, filename, message_id")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error || !attachment) {
    return { url: null, filename: null, error: "Anhang nicht gefunden." };
  }
  if (!attachment.stored || !attachment.storage_path) {
    return { url: null, filename: null, error: "Anhang ist nicht verfügbar." };
  }

  // Confirm parent message is visible under RLS (authorized inbox viewer).
  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("id", attachment.message_id)
    .maybeSingle();
  if (!message) {
    return { url: null, filename: null, error: "Keine Berechtigung." };
  }

  const safeName = sanitizeInboxFilename(attachment.filename);
  const service = createServiceRoleClient();
  const { data: signed, error: signError } = await service.storage
    .from(INBOX_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, INBOX_SIGNED_URL_TTL_SECONDS, {
      download: safeName,
    });

  if (signError || !signed?.signedUrl) {
    return { url: null, filename: null, error: "Download-Link konnte nicht erstellt werden." };
  }

  return { url: signed.signedUrl, filename: safeName, error: null };
}
