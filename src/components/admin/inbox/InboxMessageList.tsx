import { InboxMessageListRow } from "@/components/admin/inbox/InboxMessageListRow";
import { cn } from "@/lib/cn";
import type { InboxMessageListItem } from "@/lib/inbox/types";

type InboxMessageListProps = {
  messages: InboxMessageListItem[];
  /** Build row href. Defaults to standalone detail route. */
  getHref?: (message: InboxMessageListItem) => string;
  /** Selected message id for highlight. */
  selectedId?: string | null;
  /** Soft-select for desktop workspace navigation. */
  onSelect?: (messageId: string) => void;
  className?: string;
  emptyClassName?: string;
};

export function InboxMessageList({
  messages,
  getHref = (message) => `/admin/posteingang/${message.id}`,
  selectedId = null,
  onSelect,
  className,
  emptyClassName,
}: InboxMessageListProps) {
  if (messages.length === 0) {
    return (
      <div className={cn("px-5 py-14 text-center", emptyClassName)}>
        <p className="font-display text-[15px] font-bold tracking-wide text-ink uppercase">
          Keine Nachrichten
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-6 text-muted">
          Keine Treffer für die aktuelle Suche und Filter. Synchronisieren Sie erneut oder setzen
          Sie die Filter zurück.
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("divide-y divide-line/80", className)}>
      {messages.map((message) => (
        <InboxMessageListRow
          key={message.id}
          message={message}
          href={getHref(message)}
          selected={selectedId === message.id}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
