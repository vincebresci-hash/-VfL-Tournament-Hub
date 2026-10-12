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
import { InboxStatusBadge } from "@/components/admin/inbox/InboxStatusBadge";
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
    <div
      className={cn(
        adminCardShellClass,
        "overflow-hidden bg-[#f7f8fa] shadow-[0_1px_3px_rgba(16,24,40,0.06)]",
      )}
    >
      {/* Compact Apple Mail–style toolbar */}
      <div className="sticky top-0 z-10 border-b border-line/80 bg-white/90 px-3 py-2.5 backdrop-blur-md sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <Link
            href="/admin/posteingang"
            className={cn(
              adminSecondaryButtonClass,
              "h-8 rounded-full border-line/80 bg-white px-3 text-[11px] font-semibold tracking-[0.04em]",
            )}
          >
            ← Posteingang
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <InboxStatusBadge status={message.processingStatus} />
            {message.isUnreadLocal ? (
              <span className="rounded-full bg-brand-yellow/30 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
                Ungelesen
              </span>
            ) : null}

            {canManage ? (
              <>
                <div
                  className="inline-flex max-w-full flex-wrap gap-0.5 rounded-full border border-line/80 bg-[#f2f3f5] p-0.5"
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
            ) : null}
          </div>
        </div>
      </div>

      {/* Reading column — comfortable max width */}
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Subject */}
        <h1 className="text-[1.35rem] leading-snug font-semibold tracking-[-0.02em] text-ink sm:text-[1.65rem] sm:leading-tight">
          {message.subject || "(Kein Betreff)"}
        </h1>

        {/* Sender identity */}
        <section className="mt-5 rounded-2xl border border-line/70 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:p-5">
          <div className="flex gap-3.5 sm:gap-4">
            <InboxSenderAvatar
              fromName={message.fromName}
              fromAddress={message.fromAddress}
              unread={message.isUnreadLocal}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink sm:text-[16px]">
                  {senderDisplay}
                </p>
                <time
                  dateTime={message.receivedAt}
                  className="shrink-0 text-[12px] text-muted tabular-nums sm:text-[13px]"
                >
                  {formatDateTimeDe(message.receivedAt)}
                </time>
              </div>
              {message.fromName ? (
                <p className="mt-0.5 truncate text-[13px] text-muted">{message.fromAddress}</p>
              ) : null}

              <dl className="mt-3 space-y-1.5 border-t border-line/60 pt-3 text-[13px]">
                <div className="grid grid-cols-[3.25rem_1fr] gap-x-2 sm:grid-cols-[3.5rem_1fr]">
                  <dt className="text-muted">An</dt>
                  <dd className="min-w-0 break-words text-ink/85">{toLine}</dd>
                </div>
                {ccLine ? (
                  <div className="grid grid-cols-[3.25rem_1fr] gap-x-2 sm:grid-cols-[3.5rem_1fr]">
                    <dt className="text-muted">Cc</dt>
                    <dd className="min-w-0 break-words text-ink/85">{ccLine}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </section>

        {/* Body */}
        <section className="mt-5">
          <p className="mb-2.5 text-[11px] text-muted">
            Externe Bilder und aktive Inhalte sind aus Sicherheitsgründen blockiert.
          </p>
          {message.bodyHtmlSanitized ? (
            <div className="overflow-hidden rounded-2xl border border-line/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
              <iframe
                className="min-h-[360px] w-full bg-white sm:min-h-[480px]"
                // No scripts / no same-origin — inbox-only sandbox + CSP srcdoc.
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
                title="Nachrichtentext"
                srcDoc={wrapInboxHtmlForSandbox(message.bodyHtmlSanitized)}
              />
            </div>
          ) : (
            <pre className="min-h-[280px] whitespace-pre-wrap rounded-2xl border border-line/70 bg-white px-5 py-5 text-[15px] leading-7 tracking-[-0.01em] text-ink shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:px-6 sm:py-6">
              {message.bodyText || "Kein Textinhalt."}
            </pre>
          )}
        </section>

        {/* Attachments */}
        {message.attachments.length > 0 ? (
          <section className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <InboxAttachmentIcon className="text-navy/60" />
              <h2 className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
                Anhänge
              </h2>
              <span className="rounded-full bg-navy/5 px-2 py-0.5 text-[11px] font-semibold text-navy/70">
                {message.attachments.length}
              </span>
            </div>
            <ul className="grid gap-2.5">
              {message.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex flex-col gap-3 rounded-2xl border border-line/70 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#eef2f7] to-[#e4eaf2] text-navy ring-1 ring-inset ring-navy/8"
                    >
                      <InboxAttachmentIcon className="text-navy" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
                        {attachment.filename}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
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
                        "h-9 w-full shrink-0 rounded-full px-4 text-[11px] sm:w-auto",
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
