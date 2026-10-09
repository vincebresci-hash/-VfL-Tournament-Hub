import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export const INBOX_BACKFILL_DAYS = 90;
export const INBOX_SYNC_LOCK_TTL_SECONDS = 180;
/** Small batches keep Hobby invocations within wall-clock limits. */
export const INBOX_SYNC_BATCH_SIZE = 4;
/** Soft wall-clock budget for Hobby serverless (~10s). Leave headroom. */
export const INBOX_SYNC_TIME_BUDGET_MS = 7_500;
export { INBOX_FETCH_MIN_REMAINING_MS, canStartInboxFetch, remainingBudgetMs } from "@/lib/inbox/budget";
export const INBOX_IMAP_CONNECTION_TIMEOUT_MS = 3_000;
export const INBOX_IMAP_GREETING_TIMEOUT_MS = 3_000;
export const INBOX_IMAP_SOCKET_TIMEOUT_MS = 4_000;
/** Hard race timeout around a full connect+operation cycle. */
export const INBOX_IMAP_OPERATION_TIMEOUT_MS = 5_000;
/** Hard cap for logout/close cleanup — must not consume Hobby budget. */
export const INBOX_IMAP_TEARDOWN_TIMEOUT_MS = 250;
export const INBOX_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const INBOX_MAX_ATTACHMENTS_TOTAL_BYTES = 25 * 1024 * 1024;
export const INBOX_ATTACHMENT_BUCKET = "inbox-attachments";
export const INBOX_SIGNED_URL_TTL_SECONDS = 60;
export const INBOX_ATTACHMENT_REPAIR_BATCH = 2;
export const INBOX_ATTACHMENT_MAX_REPAIR_ATTEMPTS = 8;
/** Orphan leases older than this (and not referenced) may be deleted. */
export const INBOX_ORPHAN_LEASE_MAX_AGE_SECONDS = 15 * 60;
export const INBOX_ORPHAN_CLEANUP_BATCH = 10;

export type InboxImapConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  folder: string;
};

export function readInboxImapConfig(): InboxImapConfig | null {
  const host = process.env.INBOX_IMAP_HOST?.trim();
  const user = process.env.INBOX_IMAP_USER?.trim();
  const password = process.env.INBOX_IMAP_PASSWORD;
  const folder = process.env.INBOX_IMAP_FOLDER?.trim() || "INBOX";
  const portRaw = process.env.INBOX_IMAP_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 993;

  if (!host || !user || !password || !Number.isFinite(port)) {
    return null;
  }

  return {
    host,
    port,
    secure: process.env.INBOX_IMAP_SECURE?.trim() !== "false",
    user,
    password,
    folder,
  };
}

/** Inbox-specific secret only — never fall back to shared CRON_SECRET. */
export function readInboxSyncSecret(): string | null {
  const secret = process.env.INBOX_SYNC_SECRET?.trim();
  return secret || null;
}

export function assertBearerSecret(headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) {
    return false;
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }
  return timingSafeEqualDigest(match[1].trim(), secret);
}

function timingSafeEqualDigest(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}
