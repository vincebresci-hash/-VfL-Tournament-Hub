import { formatDateTimeDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import { adminStatusBadgeClass } from "@/components/admin/AdminPanel";
import { INBOX_REPLY_STATUS_LABEL } from "@/components/admin/inbox/status";
import type { InboxReplyListItem, InboxReplyStatus } from "@/lib/inbox/types";

const REPLY_STATUS_TONE: Record<InboxReplyStatus, string> = {
  pending: "bg-[#eef4fb] text-navy ring-1 ring-inset ring-navy/10",
  sending: "bg-[#fff7db] text-[#6b5300] ring-1 ring-inset ring-brand-yellow/50",
  sent: "bg-[#eef7f0] text-[#1f6b3a] ring-1 ring-inset ring-[#1f6b3a]/15",
  failed: "bg-[#fff5f5] text-[#9a2b2b] ring-1 ring-inset ring-[#d9b0b0]",
  uncertain: "bg-[#fff8e8] text-[#6b5300] ring-1 ring-inset ring-[#c9a227]/40",
};

function replyStatusBadgeClass(status: InboxReplyStatus): string {
  return cn(adminStatusBadgeClass, REPLY_STATUS_TONE[status]);
}

export function InboxReplyList({ replies }: { replies: InboxReplyListItem[] }) {
  if (!replies.length) {
    return null;
  }

  return (
    <section className="shrink-0 border-t border-line/40 pt-3" aria-label="Gesendete Antworten">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          Antworten
        </h2>
        <span className="text-[11px] font-semibold text-navy/55">{replies.length}</span>
      </div>
      <ul className="space-y-2">
        {replies.map((reply) => (
          <li
            key={reply.id}
            className="rounded-lg border border-line/50 bg-surface/20 px-3 py-2.5 sm:px-3.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
                  {reply.subject}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-muted">
                  An {reply.toAddress}
                  {reply.attachmentCount > 0 ? ` · ${reply.attachmentCount} Anhang` : ""}
                </p>
              </div>
              <span className={replyStatusBadgeClass(reply.status)}>
                {INBOX_REPLY_STATUS_LABEL[reply.status]}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted tabular-nums">
              <time dateTime={reply.createdAt}>
                Erstellt {formatDateTimeDe(reply.createdAt)}
              </time>
              {reply.sentAt ? (
                <time dateTime={reply.sentAt}>Gesendet {formatDateTimeDe(reply.sentAt)}</time>
              ) : null}
            </div>
            {reply.status === "uncertain" ? (
              <p className="mt-1.5 text-[12px] leading-4 text-[#6b5300]">
                Unklarer Status — nicht erneut senden. Bei Bedarf manuell prüfen.
              </p>
            ) : null}
            {reply.status === "failed" ? (
              <p className="mt-1.5 text-[12px] leading-4 text-[#9a2b2b]">
                Versand fehlgeschlagen. Ein neuer Versuch ist mit einer neuen Antwort möglich.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
