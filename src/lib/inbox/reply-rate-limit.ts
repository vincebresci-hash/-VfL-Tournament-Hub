import "server-only";

import {
  INBOX_REPLY_RATE_LIMIT_MAX,
  INBOX_REPLY_RATE_LIMIT_WINDOW_MS,
  isInboxReplyRateLimited,
  rateLimitWindowStart,
} from "@/lib/inbox/reply-validation";

export {
  INBOX_REPLY_RATE_LIMIT_MAX,
  INBOX_REPLY_RATE_LIMIT_WINDOW_MS,
  isInboxReplyRateLimited,
  rateLimitWindowStart,
};

/**
 * Foundation helper for a future send action:
 * compute the `p_since` timestamp for `count_inbox_replies_since`.
 */
export function inboxReplyRateLimitSince(nowMs: number = Date.now()): string {
  return rateLimitWindowStart(nowMs).toISOString();
}

export function evaluateInboxReplyRateLimit(recentCount: number): {
  limited: boolean;
  max: number;
  windowMs: number;
} {
  return {
    limited: isInboxReplyRateLimited({ recentCount }),
    max: INBOX_REPLY_RATE_LIMIT_MAX,
    windowMs: INBOX_REPLY_RATE_LIMIT_WINDOW_MS,
  };
}
