/** Phase 4 outbound reply attachment limits (shared UI/server/check constants). */

export const INBOX_REPLY_ATTACHMENT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const INBOX_REPLY_ATTACHMENT_MAX_TOTAL_BYTES = 12 * 1024 * 1024; // 12 MiB
export const INBOX_REPLY_ATTACHMENT_MAX_COUNT = 5;
export const INBOX_REPLY_ATTACHMENT_MAX_ACTOR_STAGING = 10;
export const INBOX_REPLY_ATTACHMENT_STAGING_TTL_MS = 60 * 60 * 1000;
export const INBOX_REPLY_ATTACHMENT_RETAIN_DAYS = 30;
/** Preview/download signed GET URL TTL (createSignedUrl expiresIn). */
export const INBOX_REPLY_ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60;

/**
 * Server-enforced max age from upload row `created_at` until finalize may succeed.
 * Aligns with uncommitted lease abandonment (15m). Supabase signed-upload JWT
 * lifetime is platform-controlled and is NOT configurable via createSignedUploadUrl
 * in this client — already-issued tokens may remain usable until the platform
 * JWT expires even after this deadline; finalize refuses and purge cleans up.
 */
export const INBOX_REPLY_ATTACHMENT_FINALIZE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * M4 accepted operational risk (bounded):
 * Actors can fill staging quotas (5/parent, 10 global) via begin-without-finalize
 * until expiry/purge. Quotas remain atomic; no unbounded growth.
 */
export const INBOX_REPLY_ATTACHMENT_QUOTA_ABUSE_NOTE =
  "Staging quota exhaustion via begin-without-finalize is bounded by actor/parent caps and 60m TTL / 15m lease abandon purge.";

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
