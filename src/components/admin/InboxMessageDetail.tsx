"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import {
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { InboxAttachmentIcon } from "@/components/admin/inbox/InboxAttachmentIcon";
import { InboxSenderAvatar } from "@/components/admin/inbox/InboxSenderAvatar";
import { INBOX_STATUS_LABEL } from "@/components/admin/inbox/status";
import {
  createInboxAttachmentDownloadUrlAction,
  markInboxMessageReadAction,
  updateInboxMessageLocalStateAction,
} from "@/lib/inbox/actions";
import { formatDateTimeDe } from "@/lib/format";
import { wrapInboxHtmlForSandbox } from "@/lib/inbox/sanitize-html";
import { cn } from "@/lib/cn";
import type { InboxMessageDetail as InboxMessageDetailType } from "@/lib/inbox/types";

/** Soft ceiling so ultrawide admins stay readable (~1200px). */
const READING_SHELL = "max-w-[1200px]";

type InboxMessageDetailProps = {
  message: InboxMessageDetailType;
  canManage: boolean;
};

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return "—";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10_240 ? 1 : 0)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAddressLine(entries: { name: string; address: string }[]): string {
  if (!entries.length) {
    return "—";
  }
  return entries
    .map((entry) => (entry.name ? `${entry.name} <${entry.address}>` : entry.address))
    .join(", ");
}

export function InboxMessageDetailView({ message, canManage }: InboxMessageDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!message.isUnreadLocal || !canManage) {
      return;
    }
    void markInboxMessageReadAction(message.id).then(() => {
      router.refresh();
    });
  }, [message.id, message.isUnreadLocal, canManage, router]);

  const toLine = formatAddressLine(message.toAddresses);
  const ccLine = message.ccAddresses.length ? formatAddressLine(message.ccAddresses) : null;
  const senderDisplay = message.fromName || message.fromAddress;

  return (
    <div className={cn(adminCardShellClass, "overflow-hidden bg-white")}>
      {/* Sticky status toolbar — full shell width, soft max */}
      <div className="sticky top-0 z-10 border-b border-line/60 bg-white/95 backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8 xl:px-10",
            READING_SHELL,
          )}
        >
          <Link
            href="/admin/posteingang"
            className={cn(
              adminSecondaryButtonClass,
              "h-8 rounded-full border-line/70 px-3 text-[11px] tracking-[0.04em]",
            )}
          >
            ← Posteingang
          </Link>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {message.isUnreadLocal ? (
              <span className="rounded-full bg-brand-yellow/30 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
                Ungelesen
              </span>
            ) : null}

            {canManage ? (
              <>
                <div
                  className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full border border-line/70 bg-surface/70 p-0.5"
                  role="group"
                  aria-label="Bearbeitungsstatus"
                >
                  {(["open", "in_progress", "done"] as const).map((status) => {
                    const active = message.processingStatus === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={pending || active}
                        className={cn(
                          "h-7 rounded-full px-2.5 text-[10px] font-semibold tracking-[0.04em] uppercase transition-colors",
                          active
                            ? "bg-navy text-white shadow-sm"
                            : "text-muted hover:bg-white hover:text-ink disabled:opacity-50",
                        )}
                        onClick={() => {
                          startTransition(async () => {
                            await updateInboxMessageLocalStateAction({
                              messageId: message.id,
                              processingStatus: status,
                            });
                            router.refresh();
                          });
                        }}
                      >
                        {INBOX_STATUS_LABEL[status]}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  className={cn(
                    adminSecondaryButtonClass,
                    "h-8 rounded-full px-3 text-[10px] tracking-[0.04em]",
                  )}
                  onClick={() => {
                    startTransition(async () => {
                      await updateInboxMessageLocalStateAction({
                        messageId: message.id,
                        isUnreadLocal: true,
                      });
                      router.refresh();
                    });
                  }}
                >
                  Als ungelesen
                </button>
              </>
            ) : (
              <span className="rounded-full bg-navy/5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy/80 uppercase">
                {INBOX_STATUS_LABEL[message.processingStatus]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Reading shell */}
      <div
        className={cn(
          "mx-auto w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7 xl:px-10",
          READING_SHELL,
        )}
      >
        {/* Subject = primary headline */}
        <h1 className="text-[1.45rem] leading-snug font-semibold tracking-[-0.025em] text-ink sm:text-[1.8rem] sm:leading-tight">
          {message.subject || "(Kein Betreff)"}
        </h1>

        {/* Sender row */}
        <header className="mt-4 flex gap-3 border-b border-line/60 pb-4 sm:mt-5 sm:gap-3.5 sm:pb-5">
          <InboxSenderAvatar
            fromName={message.fromName}
            fromAddress={message.fromAddress}
            unread={message.isUnreadLocal}
            size="md"
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink sm:text-[16px]">
                  {senderDisplay}
                </p>
                {message.fromName ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted sm:text-[13px]">
                    {message.fromAddress}
                  </p>
                ) : null}
              </div>
              <time
                dateTime={message.receivedAt}
                className="shrink-0 text-[12px] text-muted tabular-nums sm:text-[13px]"
              >
                {formatDateTimeDe(message.receivedAt)}
              </time>
            </div>

            <dl className="mt-2.5 space-y-0.5 text-[12px] sm:text-[13px]">
              <div className="grid grid-cols-[2.25rem_1fr] gap-x-2 sm:grid-cols-[2.5rem_1fr]">
                <dt className="text-muted">An</dt>
                <dd className="min-w-0 break-words text-ink/80">{toLine}</dd>
              </div>
              {ccLine ? (
                <div className="grid grid-cols-[2.25rem_1fr] gap-x-2 sm:grid-cols-[2.5rem_1fr]">
                  <dt className="text-muted">Cc</dt>
                  <dd className="min-w-0 break-words text-ink/80">{ccLine}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        {/* Body — no nested card border */}
        <section className="mt-5 sm:mt-6">
          <p className="mb-2.5 text-[11px] leading-4 text-muted">
            Externe Bilder und aktive Inhalte sind aus Sicherheitsgründen blockiert.
          </p>
          {message.bodyHtmlSanitized ? (
            <iframe
              className="min-h-[50vh] w-full border-0 bg-white sm:min-h-[60vh] lg:min-h-[min(68vh,720px)]"
              // No scripts / no same-origin — inbox-only sandbox + CSP srcdoc.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              title="Nachrichtentext"
              srcDoc={wrapInboxHtmlForSandbox(message.bodyHtmlSanitized)}
            />
          ) : (
            <pre className="min-h-[40vh] whitespace-pre-wrap text-[15px] leading-7 tracking-[-0.01em] text-ink sm:min-h-[50vh] lg:min-h-[min(60vh,640px)]">
              {message.bodyText || "Kein Textinhalt."}
            </pre>
          )}
        </section>

        {/* Compact attachment strip */}
        {message.attachments.length > 0 ? (
          <section className="mt-6 border-t border-line/60 pt-5 sm:mt-7">
            <div className="mb-2.5 flex items-center gap-2">
              <InboxAttachmentIcon className="text-navy/55" />
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Anhänge
              </h2>
              <span className="text-[11px] font-semibold text-navy/55">
                {message.attachments.length}
              </span>
            </div>
            <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/60 bg-surface/25">
              {message.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-3.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-navy ring-1 ring-inset ring-line/80"
                    >
                      <InboxAttachmentIcon className="text-navy" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">
                        {attachment.filename}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {attachment.contentType ?? "unbekannt"} · {formatBytes(attachment.sizeBytes)}
                        {!attachment.stored
                          ? ` · nicht gespeichert${attachment.skipReason ? ` (${attachment.skipReason})` : ""}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  {attachment.stored ? (
                    <button
                      type="button"
                      className={cn(
                        adminPrimaryButtonClass,
                        "h-8 shrink-0 rounded-full px-3 text-[10px]",
                      )}
                      onClick={() => {
                        void createInboxAttachmentDownloadUrlAction(attachment.id).then((result) => {
                          if (!result.url) {
                            return;
                          }
                          // Forced-download signed URL — never open attachment content inline.
                          const link = document.createElement("a");
                          link.href = result.url;
                          link.download = result.filename || attachment.filename;
                          link.rel = "noopener noreferrer";
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                        });
                      }}
                    >
                      Download
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
