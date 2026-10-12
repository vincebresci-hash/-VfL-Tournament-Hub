/** Separate from applications/cancellations admin nav badges. */

export function formatInboxUnreadBadgeCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  if (count > 99) {
    return "99+";
  }
  return String(Math.floor(count));
}

export function inboxUnreadBadgeAriaLabel(count: number): string {
  const display = formatInboxUnreadBadgeCount(count) ?? "0";
  return `${display} ungelesene Nachrichten im Posteingang`;
}
