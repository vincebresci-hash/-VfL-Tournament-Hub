import { simpleParser } from "mailparser";
import {
  deriveThreadKey,
  normalizeMessageIdHeader,
  toInboxAddresses,
} from "@/lib/inbox/identity";
import { buildInboxSnippet, sanitizeInboxHtml } from "@/lib/inbox/sanitize-html";
import {
  INBOX_MAX_ATTACHMENT_BYTES,
  INBOX_MAX_ATTACHMENTS_TOTAL_BYTES,
} from "@/lib/inbox/config";
import type { InboxImapFetchItem, ParsedInboxMessage } from "@/lib/inbox/types";
import {
  evaluateInboxAttachmentSafety,
  sanitizeInboxFilename,
} from "@/lib/inbox/attachments-safe";

// evaluateInboxAttachmentSafety enforces extension allowlist + MIME + sniff + magic.

export async function parseInboxFetchItem(
  item: InboxImapFetchItem,
): Promise<ParsedInboxMessage> {
  const parsed = await simpleParser(item.source);
  const fromList = Array.isArray(parsed.from) ? parsed.from : parsed.from ? [parsed.from] : [];
  const fromAddress = fromList[0]?.value?.[0]?.address ?? "";
  const fromName = fromList[0]?.value?.[0]?.name ?? "";
  const toList = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];
  const ccList = Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : [];
  const toAddresses = toInboxAddresses(toList.flatMap((entry) => entry.value ?? []));
  const ccAddresses = toInboxAddresses(ccList.flatMap((entry) => entry.value ?? []));
  const subject = (parsed.subject ?? "").trim();
  const messageIdHeader = normalizeMessageIdHeader(parsed.messageId ?? null);
  const inReplyTo = normalizeMessageIdHeader(
    Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo[0] : (parsed.inReplyTo ?? null),
  );
  const referencesHeader = Array.isArray(parsed.references)
    ? parsed.references.join(" ")
    : typeof parsed.references === "string"
      ? parsed.references
      : null;

  const bodyText = parsed.text?.trim() || null;
  const bodyHtmlSanitized = sanitizeInboxHtml(parsed.html || null);
  const snippet = buildInboxSnippet(bodyText ?? bodyHtmlSanitized?.replace(/<[^>]+>/g, " "));

  let totalAttachmentBytes = 0;
  const attachments = (parsed.attachments ?? []).map((attachment) => {
    const filename = sanitizeInboxFilename(attachment.filename || "anhang");
    const sizeBytes = attachment.size ?? attachment.content?.length ?? 0;
    const contentType = attachment.contentType || null;
    let content: Buffer | null = Buffer.isBuffer(attachment.content)
      ? attachment.content
      : attachment.content
        ? Buffer.from(attachment.content)
        : null;
    let skipReason: string | null = null;

    if (sizeBytes > INBOX_MAX_ATTACHMENT_BYTES) {
      content = null;
      skipReason = "file_too_large";
    } else if (totalAttachmentBytes + sizeBytes > INBOX_MAX_ATTACHMENTS_TOTAL_BYTES) {
      content = null;
      skipReason = "message_attachments_too_large";
    } else {
      const safety = evaluateInboxAttachmentSafety({
        filename,
        contentType,
        content,
      });
      if (!safety.allowed) {
        content = null;
        skipReason = safety.reason ?? "mime_or_extension_blocked";
      } else if (content) {
        totalAttachmentBytes += sizeBytes;
      } else {
        skipReason = "missing_content";
      }
    }

    return {
      filename,
      contentType,
      sizeBytes,
      contentId: attachment.contentId ?? null,
      content,
      skipReason,
    };
  });

  const receivedAt = (item.internalDate ?? parsed.date ?? new Date()).toISOString();
  const sentAt = parsed.date ? parsed.date.toISOString() : null;

  return {
    imapUid: item.uid,
    messageIdHeader,
    inReplyTo,
    referencesHeader,
    threadKey: deriveThreadKey({
      messageIdHeader,
      inReplyTo,
      referencesHeader,
      subject,
      fromAddress: fromAddress.toLowerCase(),
    }),
    fromAddress: fromAddress.toLowerCase(),
    fromName: fromName.trim(),
    toAddresses,
    ccAddresses,
    subject,
    sentAt,
    receivedAt,
    snippet,
    bodyText,
    bodyHtmlSanitized,
    hasAttachments: attachments.length > 0,
    sizeBytes: item.source.length,
    imapFlags: item.flags,
    attachments,
  };
}
