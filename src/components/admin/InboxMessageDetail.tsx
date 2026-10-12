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

  const toLine = message.toAddresses.length
    ? message.toAddresses
        .map((entry) => (entry.name ? `${entry.name} <${entry.address}>` : entry.address))
        .join(", ")
    : "—";
  const ccLine = message.ccAddresses.length
    ? message.ccAddresses
        .map((entry) => (entry.name ? `${entry.name} <${entry.address}>` : entry.address))
        .join(", ")
    : null;

  return (
    <div className={cn(adminCardShellClass, "overflow-hidden")}>
      {/* Action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-gradient-to-b from-surface/80 to-white px-4 py-3 sm:px-5">
        <Link
          href="/admin/posteingang"
          className={cn(adminSecondaryButtonClass, "h-9 px-3 text-[11px]")}
        >
          ← Posteingang
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <InboxStatusBadge status={message.processingStatus} />
          {message.isUnreadLocal ? (
            <span className="rounded-md bg-brand-yellow/25 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
              Ungelesen
            </span>
          ) : null}
        </div>
      </div>

      {/* Message header */}
      <header className="border-b border-line px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex gap-3 sm:gap-4">
          <InboxSenderAvatar
            fromName={message.fromName}
            fromAddress={message.fromAddress}
            unread={message.isUnreadLocal}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold tracking-wide text-ink uppercase sm:text-2xl">
              {message.subject || "(Kein Betreff)"}
            </h1>
            <p className="mt-2 text-[14px] text-ink">
              <span className="font-semibold">
                {message.fromName || message.fromAddress}
              </span>
              {message.fromName ? (
                <span className="text-muted"> &lt;{message.fromAddress}&gt;</span>
              ) : null}
            </p>
            <dl className="mt-3 grid gap-1.5 text-[13px] text-muted">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-ink/70">An</dt>
                <dd className="min-w-0 break-words">{toLine}</dd>
              </div>
              {ccLine ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-ink/70">Cc</dt>
                  <dd className="min-w-0 break-words">{ccLine}</dd>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-ink/70">Empfangen</dt>
                <dd>{formatDateTimeDe(message.receivedAt)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {canManage ? (
          <div className="mt-5 flex flex-col gap-2 border-t border-line/70 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase sm:mr-1">
              Status
            </p>
            <div
              className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface/50 p-1"
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
                      "h-8 rounded-md px-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase transition-colors",
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
              className={cn(adminSecondaryButtonClass, "h-9 px-3 text-[11px]")}
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
              Als ungelesen markieren
            </button>
          </div>
        ) : null}
      </header>

      {/* Reading pane */}
      <section className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Nachricht
          </h2>
          <p className="text-[12px] text-muted">
            Externe Bilder und aktive Inhalte sind blockiert.
          </p>
        </div>
        {message.bodyHtmlSanitized ? (
          <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[inset_0_1px_0_rgba(16,24,40,0.03)]">
            <iframe
              className="min-h-[320px] w-full bg-white sm:min-h-[420px]"
              // No scripts / no same-origin — inbox-only sandbox + CSP srcdoc.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              title="Nachrichtentext"
              srcDoc={wrapInboxHtmlForSandbox(message.bodyHtmlSanitized)}
            />
          </div>
        ) : (
          <pre className="min-h-[240px] whitespace-pre-wrap rounded-xl border border-line bg-surface/30 px-4 py-4 text-[14px] leading-7 text-ink sm:px-5">
            {message.bodyText || "Kein Textinhalt."}
          </pre>
        )}
      </section>

      {/* Attachments */}
      {message.attachments.length > 0 ? (
        <section className="border-t border-line bg-surface/30 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mb-3 flex items-center gap-2">
            <InboxAttachmentIcon className="text-navy/70" />
            <h2 className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
              Anhänge ({message.attachments.length})
            </h2>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {message.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy/5 text-navy"
                  >
                    <InboxAttachmentIcon className="text-navy" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-ink">
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
                    className={cn(adminPrimaryButtonClass, "h-9 shrink-0 px-3 text-[11px]")}
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
  );
}
