/** Soft wall-clock helpers for Hobby-safe sync gating (pure; no secrets). */

export const INBOX_FETCH_MIN_REMAINING_MS = 2_500;

export function remainingBudgetMs(startedAtMs: number, budgetMs: number, nowMs = Date.now()): number {
  return budgetMs - (nowMs - startedAtMs);
}

export function canStartInboxFetch(
  startedAtMs: number,
  budgetMs: number,
  nowMs = Date.now(),
  minRemainingMs = INBOX_FETCH_MIN_REMAINING_MS,
): boolean {
  return remainingBudgetMs(startedAtMs, budgetMs, nowMs) >= minRemainingMs;
}
