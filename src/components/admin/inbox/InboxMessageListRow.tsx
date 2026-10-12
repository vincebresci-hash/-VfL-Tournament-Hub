import Link from "next/link";
import { InboxAttachmentIcon } from "@/components/admin/inbox/InboxAttachmentIcon";
import { formatInboxListTimestamp } from "@/components/admin/inbox/format";
import { InboxSenderAvatar } from "@/components/admin/inbox/InboxSenderAvatar";
import { InboxStatusBadge } from "@/components/admin/inbox/InboxStatusBadge";
import { cn } from "@/lib/cn";
import type { InboxMessageListItem } from "@/lib/inbox/types";

type InboxMessageListRowProps = {
  message: InboxMessageListItem;
  href: string;
  /** Two-pane / list selection highlight. */
  selected?: boolean;
  /**
   * Soft-select handler for the desktop workspace. Modified clicks (new tab,
   * etc.) still follow `href` for deep links.
   */
  onSelect?: (messageId: string) => void;
};

export function InboxMessageListRow({
  message,
  href,
  selected = false,
  onSelect,
}: InboxMessageListRowProps) {
  const sender = message.fromName || message.fromAddress;

  return (
    <li>
      <Link
        href={href}
        aria-current={selected ? "page" : undefined}
        onClick={(event) => {
          if (!onSelect) {
            return;
          }
          if (event.defaultPrevented) {
            return;
          }
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }
          if (event.button !== 0) {
            return;
          }
          event.preventDefault();
          onSelect(message.id);
        }}
        className={cn(
          "group relative flex gap-2.5 px-3 py-2.5 transition-colors sm:gap-3 sm:px-3.5",
          "hover:bg-surface/75 focus-visible:bg-surface/75 focus-visible:outline-none",
          selected
            ? "bg-navy/[0.045]"
            : message.isUnreadLocal
              ? "bg-[#fffdf3]/75"
              : "bg-white",
        )}
      >
        {/* Yellow rail: selected (strong) or unread (softer) */}
        {selected || message.isUnreadLocal ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-0 bottom-0 left-0 w-0.5",
              selected ? "bg-brand-yellow" : "bg-brand-yellow/65",
            )}
          />
        ) : null}

        <InboxSenderAvatar
          fromName={message.fromName}
          fromAddress={message.fromAddress}
          unread={message.isUnreadLocal}
          size="sm"
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-[13px] leading-5",
                message.isUnreadLocal || selected
                  ? "font-semibold text-ink"
                  : "font-medium text-ink/90",
              )}
            >
              {sender}
            </p>
            <time
              dateTime={message.receivedAt}
              className={cn(
                "shrink-0 pt-0.5 text-[11px] leading-4 tabular-nums",
                message.isUnreadLocal ? "font-semibold text-navy" : "text-muted",
              )}
            >
              {formatInboxListTimestamp(message.receivedAt)}
            </time>
          </div>

          <p
            className={cn(
              "mt-0.5 truncate text-[13px] leading-5",
              message.isUnreadLocal || selected
                ? "font-semibold text-ink"
                : "font-medium text-ink/80",
            )}
          >
            {message.subject || "(Kein Betreff)"}
          </p>

          <div className="mt-1 flex items-center gap-1.5">
            {message.hasAttachments ? (
              <InboxAttachmentIcon className="shrink-0 opacity-70" />
            ) : null}
            <p className="line-clamp-1 min-w-0 flex-1 text-[12px] leading-4 text-muted">
              {message.snippet || "Kein Vorschautext"}
            </p>
            <span className="shrink-0">
              <InboxStatusBadge status={message.processingStatus} />
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
