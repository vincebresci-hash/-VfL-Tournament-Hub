import "server-only";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/guards";
import { canAccessInbox, canReplyInbox } from "@/lib/inbox/access";
import { INBOX_REPLY_ATTACHMENT_BUCKET } from "@/lib/inbox/reply-attachment-config";
import {
  executeInboxReplySend,
  parseClaimInboxReplyRow,
  redactInboxSmtpAuditText,
  resolveMailboxMessageIdDomainUpdate,
  type InboxReplyBoundUploadMeta,
  type InboxReplyOperationalAlert,
  type SendInboxReplyInput,
  type SendInboxReplyResult,
} from "@/lib/inbox/reply-send";
import { assertMessageIdDomain } from "@/lib/inbox/reply-headers";
import { readInboxSmtpConfig } from "@/lib/inbox/smtp-config";
import { sendInboxSmtpMail } from "@/lib/inbox/smtp-client";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

async function requireReplySession() {
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
  return { error: null, session: access.session, authorization: access.authorization };
}

async function loadParentMessageForReply(parentMessageId: string) {
  // Authenticated user client — RLS applies (inbox.view).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbox_messages")
    .select("id, mailbox_id, from_address, subject")
    .eq("id", parentMessageId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    mailboxId: data.mailbox_id,
    fromAddress: data.from_address,
    subject: data.subject || "(ohne Betreff)",
  };
}

/**
 * Initialize / validate mailbox.reply_message_id_domain from IONOS SMTP From.
 * Uses service_role only (trusted server connection). Never overwrites a mismatch.
 */
async function ensureMailboxMessageIdDomain(input: {
  mailboxId: string;
  messageIdDomain: string;
}): Promise<
  | { ok: true }
  | { ok: false; code: "domain_mismatch" | "domain_not_configured"; error: string }
> {
  const domain = assertMessageIdDomain(input.messageIdDomain);
  if (!domain) {
    return {
      ok: false,
      code: "domain_not_configured",
      error: "Message-ID-Domain ist ungültig konfiguriert.",
    };
  }

  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return {
      ok: false,
      code: "domain_not_configured",
      error: "Server-Datenbankverbindung ist nicht verfügbar.",
    };
  }

  const { data: mailbox, error: readError } = await service
    .from("inbox_mailboxes")
    .select("id, reply_message_id_domain")
    .eq("id", input.mailboxId)
    .maybeSingle();

  if (readError || !mailbox) {
    return {
      ok: false,
      code: "domain_not_configured",
      error: "Postfach für Antworten nicht gefunden.",
    };
  }

  const decision = resolveMailboxMessageIdDomainUpdate({
    currentDomain: mailbox.reply_message_id_domain,
    configuredDomain: domain,
  });

  if (decision.action === "invalid") {
    return {
      ok: false,
      code: "domain_not_configured",
      error: "Message-ID-Domain ist ungültig konfiguriert.",
    };
  }
  if (decision.action === "mismatch") {
    return {
      ok: false,
      code: "domain_mismatch",
      error: "Message-ID-Domain stimmt nicht mit dem konfigurierten Absender überein.",
    };
  }
  if (decision.action === "ok") {
    return { ok: true };
  }

  const { error: updateError } = await service
    .from("inbox_mailboxes")
    .update({ reply_message_id_domain: decision.domain })
    .eq("id", input.mailboxId)
    .is("reply_message_id_domain", null);

  // Always re-read: concurrent writers may have set/changed the domain.
  const { data: again } = await service
    .from("inbox_mailboxes")
    .select("reply_message_id_domain")
    .eq("id", input.mailboxId)
    .maybeSingle();
  const retry = resolveMailboxMessageIdDomainUpdate({
    currentDomain: again?.reply_message_id_domain,
    configuredDomain: domain,
  });
  if (retry.action === "ok") {
    return { ok: true };
  }
  if (retry.action === "mismatch") {
    return {
      ok: false,
      code: "domain_mismatch",
      error: "Message-ID-Domain stimmt nicht mit dem konfigurierten Absender überein.",
    };
  }
  return {
    ok: false,
    code: "domain_not_configured",
    error: updateError
      ? "Message-ID-Domain konnte nicht gesetzt werden."
      : "Message-ID-Domain ist für dieses Postfach nicht konfiguriert.",
  };
}

async function claimReplySend(input: {
  parentMessageId: string;
  idempotencyKey: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  uploadIds: string[];
}) {
  // Authenticated user client — claim RPC enforces inbox.view + inbox.reply + recipient lock.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_inbox_reply_send", {
    p_parent_message_id: input.parentMessageId,
    p_idempotency_key: input.idempotencyKey,
    p_to_address: input.toAddress,
    p_subject: input.subject,
    p_body_text: input.bodyText,
    p_upload_ids: input.uploadIds.length > 0 ? input.uploadIds : null,
  });

  if (error) {
    // Never forward raw PostgREST/DB messages to the browser.
    return { row: null, error: "claim_rpc_failed" };
  }

  const row = parseClaimInboxReplyRow(data);
  if (!row) {
    return { row: null, error: "unexpected claim payload" };
  }
  return { row, error: null };
}

async function listBoundUploadsForReply(
  replyId: string,
): Promise<{ rows: InboxReplyBoundUploadMeta[]; error: string | null }> {
  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return { rows: [], error: "service_role unavailable" };
  }

  const { data, error } = await service.rpc("list_inbox_reply_bound_uploads", {
    p_reply_id: replyId,
  });
  if (error) {
    return { rows: [], error: "list_bound_failed" };
  }

  const rows: InboxReplyBoundUploadMeta[] = [];
  for (const row of data ?? []) {
    if (
      typeof row.upload_id !== "string" ||
      typeof row.filename !== "string" ||
      typeof row.content_type !== "string" ||
      typeof row.size_bytes !== "number" ||
      typeof row.checksum_sha256 !== "string" ||
      typeof row.storage_path !== "string"
    ) {
      return { rows: [], error: "list_bound_shape" };
    }
    rows.push({
      uploadId: row.upload_id,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      checksumSha256: row.checksum_sha256,
      storagePath: row.storage_path,
      bindOrdinal: typeof row.bind_ordinal === "number" ? row.bind_ordinal : null,
    });
  }
  return { rows, error: null };
}

async function downloadBoundUploadBytes(input: {
  storagePath: string;
  expectedSizeBytes: number;
  expectedChecksumSha256: string;
}): Promise<{ content: Buffer | null; error: string | null }> {
  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return { content: null, error: "service_role unavailable" };
  }

  const { data, error } = await service.storage
    .from(INBOX_REPLY_ATTACHMENT_BUCKET)
    .download(input.storagePath);
  if (error || !data) {
    return { content: null, error: "storage_download_failed" };
  }

  const content = Buffer.from(await data.arrayBuffer());
  if (content.length !== input.expectedSizeBytes) {
    return { content: null, error: "size_mismatch" };
  }
  const digest = createHash("sha256").update(content).digest("hex");
  if (digest !== input.expectedChecksumSha256.toLowerCase()) {
    return { content: null, error: "checksum_mismatch" };
  }
  return { content, error: null };
}

async function finalizeReplySend(input: {
  replyId: string;
  status: "sent" | "failed" | "uncertain";
  error: string | null;
  smtpResponse: string | null;
}) {
  let service;
  try {
    service = createServiceRoleClient();
  } catch {
    return { ok: false, error: "service_role unavailable" };
  }

  // App-layer redaction before persistence (SQL also redacts).
  const { data, error } = await service.rpc("finalize_inbox_reply_send", {
    p_reply_id: input.replyId,
    p_status: input.status,
    p_error: redactInboxSmtpAuditText(input.error),
    p_smtp_response: redactInboxSmtpAuditText(input.smtpResponse),
  });

  if (error) {
    return { ok: false, error: "finalize_rpc_failed" };
  }
  return { ok: data === true, error: data === true ? null : "finalize returned false" };
}

/**
 * Structured, sanitized server-side alert. Never logs passwords or service_role keys.
 */
export function emitInboxReplyOperationalAlert(alert: InboxReplyOperationalAlert): void {
  const safeDetail = redactInboxSmtpAuditText(alert.detail) ?? "";
  console.error("[inbox_reply_ops]", {
    kind: alert.kind,
    replyId: alert.replyId,
    parentMessageId: alert.parentMessageId,
    smtpOutcome: alert.smtpOutcome,
    primaryFinalizeOk: alert.primaryFinalizeOk,
    compensationFinalizeOk: alert.compensationFinalizeOk,
    detail: safeDetail,
  });
}

/**
 * Secure server-side IONOS SMTP reply action.
 * Claim uses the authenticated user client (RLS + inbox.reply).
 * Finalize / domain ensure use service_role only. Never uses Resend. Never auto-retries uncertain.
 */
export async function sendInboxReplyAction(
  input: SendInboxReplyInput,
): Promise<SendInboxReplyResult> {
  const result = await executeInboxReplySend(input, {
    requireSession: requireReplySession,
    canReply: canReplyInbox,
    readSmtpConfig: readInboxSmtpConfig,
    loadParentMessage: loadParentMessageForReply,
    ensureMessageIdDomain: ensureMailboxMessageIdDomain,
    claimReply: claimReplySend,
    listBoundUploads: listBoundUploadsForReply,
    downloadBoundUpload: downloadBoundUploadBytes,
    sendSmtp: sendInboxSmtpMail,
    finalizeReply: finalizeReplySend,
    emitOperationalAlert: emitInboxReplyOperationalAlert,
    // Hobby Fluid maxDuration=180 leaves SMTP+finalize headroom; keep fail-closed until E2E approval.
    allowAttachmentSend: false,
  });

  if (result.ok || result.sendAttempted) {
    revalidatePath("/admin/posteingang");
    if (input.parentMessageId) {
      revalidatePath(`/admin/posteingang/${input.parentMessageId.trim()}`);
    }
    revalidatePath("/admin", "layout");
  }

  return result;
}
