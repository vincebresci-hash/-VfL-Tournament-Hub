import { hashRateLimitIdentifier } from "@/lib/cancellations/tokens";

/**
 * In-memory, per-runtime/serverless-instance rate limiting.
 * Best-effort only — not a global distributed abuse-control mechanism.
 */
const HELP_CHAT_ACTION_TYPE = "help_chat";
const HELP_CHAT_MAX_ATTEMPTS = 30;
const HELP_CHAT_WINDOW_MS = 60 * 60 * 1000;
const HELP_CHAT_STORE_CLEANUP_THRESHOLD = 1000;

type AttemptRecord = {
  timestamps: number[];
};

const attemptStore = new Map<string, AttemptRecord>();

function pruneOldTimestamps(timestamps: number[], now: number) {
  return timestamps.filter((timestamp) => now - timestamp <= HELP_CHAT_WINDOW_MS);
}

function deleteIfEmpty(key: string, timestamps: number[]) {
  if (timestamps.length === 0) {
    attemptStore.delete(key);
    return;
  }

  attemptStore.set(key, { timestamps });
}

function opportunisticCleanup() {
  if (attemptStore.size <= HELP_CHAT_STORE_CLEANUP_THRESHOLD) {
    return;
  }

  const now = Date.now();
  for (const [key, record] of attemptStore.entries()) {
    const active = pruneOldTimestamps(record.timestamps, now);
    deleteIfEmpty(key, active);
  }
}

export function getHelpChatRateLimitKey(identifier: string) {
  return hashRateLimitIdentifier(`${HELP_CHAT_ACTION_TYPE}:${identifier}`);
}

export function resolveHelpChatRateLimitIdentifier(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const clientIp = forwarded.split(",")[0]?.trim();
    if (clientIp) {
      return clientIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  // Fail open: no shared global bucket for unidentified clients.
  return null;
}

export function isHelpChatRateLimited(identifier: string, now = Date.now()) {
  const key = getHelpChatRateLimitKey(identifier);
  const record = attemptStore.get(key);
  if (!record) {
    return false;
  }

  const active = pruneOldTimestamps(record.timestamps, now);
  deleteIfEmpty(key, active);
  return active.length >= HELP_CHAT_MAX_ATTEMPTS;
}

export function recordHelpChatAttempt(identifier: string, now = Date.now()) {
  const key = getHelpChatRateLimitKey(identifier);
  const record = attemptStore.get(key);
  const timestamps = pruneOldTimestamps(record?.timestamps ?? [], now);
  timestamps.push(now);
  deleteIfEmpty(key, timestamps);
  opportunisticCleanup();
}

export function resetHelpChatRateLimitStoreForTests() {
  attemptStore.clear();
}

export const HELP_CHAT_RATE_LIMIT_MESSAGE =
  "Zu viele Anfragen. Bitte versucht es in einiger Zeit erneut.";

export const HELP_CHAT_RATE_LIMIT_CONFIG = {
  actionType: HELP_CHAT_ACTION_TYPE,
  maxAttempts: HELP_CHAT_MAX_ATTEMPTS,
  windowMs: HELP_CHAT_WINDOW_MS,
  failOpenWithoutClientIdentifier: true,
  serverlessScope: "per-runtime-instance",
} as const;
