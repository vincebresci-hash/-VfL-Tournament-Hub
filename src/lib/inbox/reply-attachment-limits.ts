/** Phase 4 outbound reply attachment limits (shared UI/server/check constants). */

export const INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES = 12 * 1024 * 1024; // 12 MiB
export const INBOX_REPLY_ATTACHMENT_MAX_COUNT = 5;
export const INBOX_REPLY_ATTACHMENT_MAX_ACTOR_STAGING = 10;
export const INBOX_REPLY_ATTACHMENT_STAGING_TTL_MS = 60 * 60 * 1000;
export const INBOX_REPLY_ATTACHMENT_RETAIN_DAYS = 30;
export const INBOX_REPLY_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60;

export const INBOX_REPLY_ATTACHMENT_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "docx",
  "xlsx",
] as const;

export type InboxReplyAttachmentExtension =
  (typeof INBOX_REPLY_ATTACHMENT_EXTENSIONS)[number];

export const INBOX_REPLY_ATTACHMENT_MIME_BY_EXT: Record<
  InboxReplyAttachmentExtension,
  readonly string[]
> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};
