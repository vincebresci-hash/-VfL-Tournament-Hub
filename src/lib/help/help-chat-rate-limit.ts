import { hashRateLimitIdentifier } from "@/lib/cancellations/tokens";

const HELP_CHAT_ACTION_TYPE = "help_chat";
const HELP_CHAT_MAX_ATTEMPTS = 30;
const HELP_CHAT_WINDOW_MS = 60 * 60 * 1000;

type AttemptRecord = {
  timestamps: number[];
};

const attemptStore = new Map<string, AttemptRecord>();

function pruneOldTimestamps(timestamps: number[], now: number) {
  return timestamps.filter((timestamp) => now - timestamp <= HELP_CHAT_WINDOW_MS);
}

export function getHelpChatRateLimitKey(identifier: string) {
  return hashRateLimitIdentifier(`${HELP_CHAT_ACTION_TYPE}:${identifier}`);
}

export function isHelpChatRateLimited(identifier: string, now = Date.now()) {
  const key = getHelpChatRateLimitKey(identifier);
  const record = attemptStore.get(key);
  if (!record) {
    return false;
  }

  const active = pruneOldTimestamps(record.timestamps, now);
  return active.length >= HELP_CHAT_MAX_ATTEMPTS;
}

export function recordHelpChatAttempt(identifier: string, now = Date.now()) {
  const key = getHelpChatRateLimitKey(identifier);
  const record = attemptStore.get(key);
  const timestamps = pruneOldTimestamps(record?.timestamps ?? [], now);
  timestamps.push(now);
  attemptStore.set(key, { timestamps });
}

export const HELP_CHAT_RATE_LIMIT_MESSAGE =
  "Zu viele Anfragen. Bitte versucht es in einiger Zeit erneut.";

export const HELP_CHAT_RATE_LIMIT_CONFIG = {
  actionType: HELP_CHAT_ACTION_TYPE,
  maxAttempts: HELP_CHAT_MAX_ATTEMPTS,
  windowMs: HELP_CHAT_WINDOW_MS,
} as const;
