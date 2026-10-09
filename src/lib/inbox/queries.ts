import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { buildInboxMessageSearchOrFilter } from "@/lib/inbox/search";
import { sanitizeInboxHtml } from "@/lib/inbox/sanitize-html";
import type {
  InboxAddress,
  InboxAttachmentItem,
  InboxMessageDetail,
  InboxMessageListItem,
  InboxProcessingStatus,
  InboxSyncStateView,
} from "@/lib/inbox/types";

function mapStatus(value: string | null | undefined): InboxProcessingStatus {
  if (value === "in_progress" || value === "done") {
    return value;
  }
  return "open";
}

function mapAddresses(value: unknown): InboxAddress[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return { address: "", name: "" };
    }
    const record = entry as { address?: unknown; name?: unknown };
    return {
      address: typeof record.address === "string" ? record.address : "",
      name: typeof record.name === "string" ? record.name : "",
    };
  });
}

export async function listInboxMessages(input?: {
  query?: string;
  status?: InboxProcessingStatus | "all";
  unreadOnly?: boolean;
}): Promise<{ messages: InboxMessageListItem[]; ready: boolean }> {
  const supabase = await createClient();
  const { data: statusRows, error: statusError } = await supabase.rpc("get_inbox_sync_status");

  if (statusError) {
    return { messages: [], ready: !isMissingRelationError(statusError) };
  }

  const state = Array.isArray(statusRows) ? statusRows[0] : statusRows;
  if (!state?.uidvalidity) {
    const { error } = await supabase.from("inbox_messages").select("id").limit(1);
    return { messages: [], ready: !error || !isMissingRelationError(error) };
  }

  let query = supabase
    .from("inbox_messages")
    .select(
      "id, from_address, from_name, subject, received_at, snippet, is_unread_local, processing_status, has_attachments, uidvalidity",
    )
    .eq("mailbox_id", state.mailbox_id)
    .eq("uidvalidity", state.uidvalidity)
    .order("received_at", { ascending: false })
    .limit(200);

  if (input?.status && input.status !== "all") {
    query = query.eq("processing_status", input.status);
  }
  if (input?.unreadOnly) {
    query = query.eq("is_unread_local", true);
  }
  if (input?.query?.trim()) {
    const filter = buildInboxMessageSearchOrFilter(input.query);
    if (filter) {
      query = query.or(filter);
    }
  }

  const { data, error } = await query;
  if (error) {
    return { messages: [], ready: !isMissingRelationError(error) };
  }

  return {
    ready: true,
    messages: (data ?? []).map((row) => ({
      id: row.id,
      fromAddress: row.from_address,
      fromName: row.from_name,
      subject: row.subject || "(ohne Betreff)",
      receivedAt: row.received_at,
      snippet: row.snippet,
      isUnreadLocal: row.is_unread_local,
      processingStatus: mapStatus(row.processing_status),
      hasAttachments: row.has_attachments,
      uidvalidity: Number(row.uidvalidity),
    })),
  };
}

export async function getInboxMessageDetail(
  messageId: string,
): Promise<{ message: InboxMessageDetail | null; ready: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbox_messages")
    .select(
      "id, mailbox_id, folder, imap_uid, message_id_header, from_address, from_name, to_addresses, cc_addresses, subject, sent_at, received_at, snippet, body_text, body_html_sanitized, is_unread_local, processing_status, has_attachments, uidvalidity",
    )
    .eq("id", messageId)
    .maybeSingle();

  if (error) {
    return { message: null, ready: !isMissingRelationError(error) };
  }
  if (!data) {
    return { message: null, ready: true };
  }

  const { data: attachments } = await supabase
    .from("inbox_attachments")
    .select("id, filename, content_type, size_bytes, stored, skip_reason")
    .eq("message_id", messageId)
    .order("part_index", { ascending: true });

  const attachmentItems: InboxAttachmentItem[] = (attachments ?? []).map((row) => ({
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    stored: row.stored,
    skipReason: row.skip_reason,
  }));

  // Defense-in-depth: re-sanitize on read (never trust stored HTML alone).
  const bodyHtmlSanitized = sanitizeInboxHtml(data.body_html_sanitized);

  return {
    ready: true,
    message: {
      id: data.id,
      mailboxId: data.mailbox_id,
      folder: data.folder,
      imapUid: Number(data.imap_uid),
      messageIdHeader: data.message_id_header,
      fromAddress: data.from_address,
      fromName: data.from_name,
      toAddresses: mapAddresses(data.to_addresses),
      ccAddresses: mapAddresses(data.cc_addresses),
      subject: data.subject || "(ohne Betreff)",
      sentAt: data.sent_at,
      receivedAt: data.received_at,
      snippet: data.snippet,
      bodyText: data.body_text,
      bodyHtmlSanitized,
      isUnreadLocal: data.is_unread_local,
      processingStatus: mapStatus(data.processing_status),
      hasAttachments: data.has_attachments,
      uidvalidity: Number(data.uidvalidity),
      attachments: attachmentItems,
    },
  };
}

export async function getInboxSyncStateView(): Promise<{
  state: InboxSyncStateView | null;
  ready: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_inbox_sync_status");

  if (error) {
    return { state: null, ready: !isMissingRelationError(error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { state: null, ready: true };
  }

  return {
    ready: true,
    state: {
      mailboxId: row.mailbox_id,
      folder: row.folder,
      uidvalidity: row.uidvalidity == null ? null : Number(row.uidvalidity),
      cursorUid: Number(row.cursor_uid ?? 0),
      backfillComplete: Boolean(row.backfill_complete),
      backfillCutoffAt: row.backfill_cutoff_at,
      lastSyncedAt: row.last_synced_at,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
    },
  };
}

export async function loadInboxUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_inbox_unread_count");
  if (error) {
    return 0;
  }
  return Math.max(0, Number(data) || 0);
}
