export const ADMIN_NAV_BADGE_KEYS = ["applications", "cancellations"] as const;

export type AdminNavBadgeKey = (typeof ADMIN_NAV_BADGE_KEYS)[number];

export type AdminNavCursor = {
  seenUntil: string;
  seenId: string;
};

export type AdminNavBadgeCounts = Record<AdminNavBadgeKey, number>;

export const emptyAdminNavBadgeCounts: AdminNavBadgeCounts = {
  applications: 0,
  cancellations: 0,
};

export const ADMIN_NAV_NIL_UUID = "00000000-0000-0000-0000-000000000000";

export type AdminNavCursorItem = {
  id: string;
  timestamp: string;
};

export function isAdminNavBadgeKey(value: string): value is AdminNavBadgeKey {
  return (ADMIN_NAV_BADGE_KEYS as readonly string[]).includes(value);
}

/** Lexicographic compare for (timestamp, id) cursors. Negative if a < b. */
export function compareAdminNavCursors(
  a: AdminNavCursor,
  b: AdminNavCursor,
): number {
  if (a.seenUntil < b.seenUntil) {
    return -1;
  }
  if (a.seenUntil > b.seenUntil) {
    return 1;
  }
  if (a.seenId < b.seenId) {
    return -1;
  }
  if (a.seenId > b.seenId) {
    return 1;
  }
  return 0;
}

export function maxAdminNavCursor(
  items: readonly AdminNavCursorItem[],
): AdminNavCursor | null {
  let max: AdminNavCursor | null = null;

  for (const item of items) {
    if (!item.id || !item.timestamp) {
      continue;
    }
    const candidate = { seenUntil: item.timestamp, seenId: item.id };
    if (!max || compareAdminNavCursors(candidate, max) > 0) {
      max = candidate;
    }
  }

  return max;
}

export function isUnreadAdminNavItem(
  item: AdminNavCursorItem,
  cursor: AdminNavCursor | null,
): boolean {
  if (!cursor) {
    return true;
  }

  return (
    compareAdminNavCursors(
      { seenUntil: item.timestamp, seenId: item.id },
      cursor,
    ) > 0
  );
}

/** Monotonic merge: never move the stored cursor backwards. */
export function mergeAdminNavCursor(
  current: AdminNavCursor | null,
  incoming: AdminNavCursor,
): AdminNavCursor {
  if (!current || compareAdminNavCursors(current, incoming) < 0) {
    return incoming;
  }
  return current;
}

export function formatAdminNavBadgeCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  if (count > 99) {
    return "99+";
  }
  return String(Math.floor(count));
}

export function adminNavBadgeAriaLabel(label: string, count: number): string {
  const display = formatAdminNavBadgeCount(count) ?? "0";
  return `${display} neue ${label}`;
}
