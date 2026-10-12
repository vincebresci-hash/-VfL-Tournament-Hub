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
          "group relative flex gap-3 px-4 py-3.5 transition-colors sm:gap-4 sm:px-5 sm:py-3.5",
          "hover:bg-surface/70 focus-visible:bg-surface/70 focus-visible:outline-none",
          message.isUnreadLocal ? "bg-[#fffdf3]/70" : "bg-white",
          selected && "bg-navy/[0.04] ring-1 ring-inset ring-navy/15",
        )}
      >
        {message.isUnreadLocal ? (
          <span aria-hidden className="absolute top-0 bottom-0 left-0 w-1 bg-brand-yellow" />
        ) : null}

        <InboxSenderAvatar
          fromName={message.fromName}
          fromAddress={message.fromAddress}
          unread={message.isUnreadLocal}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p
                  className={cn(
                    "truncate text-[14px]",
                    message.isUnreadLocal ? "font-semibold text-ink" : "font-medium text-ink/90",
                  )}
                >
                  {sender}
                </p>
                {message.fromName && message.fromAddress ? (
                  <p className="hidden truncate text-[12px] text-muted sm:block">
                    {message.fromAddress}
                  </p>
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-0.5 truncate text-[14px] sm:text-[15px]",
                  message.isUnreadLocal ? "font-semibold text-ink" : "font-medium text-ink/85",
                )}
              >
                {message.subject || "(Kein Betreff)"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <time
                dateTime={message.receivedAt}
                className={cn(
                  "text-[12px] tabular-nums",
                  message.isUnreadLocal ? "font-semibold text-navy" : "text-muted",
                )}
              >
                {formatInboxListTimestamp(message.receivedAt)}
              </time>
              <InboxStatusBadge status={message.processingStatus} />
            </div>
          </div>

          <div className="mt-1 flex items-center gap-2">
            {message.hasAttachments ? (
              <InboxAttachmentIcon className="shrink-0 opacity-80" />
            ) : null}
            {message.snippet ? (
              <p className="line-clamp-1 min-w-0 flex-1 text-[13px] leading-5 text-muted">
                {message.snippet}
              </p>
            ) : (
              <p className="text-[13px] text-muted/70">Kein Vorschautext</p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
