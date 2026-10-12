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
import { INBOX_HTML_CSP } from "@/lib/inbox/sanitize-html";
import { cn } from "@/lib/cn";
import type { InboxMessageDetail as InboxMessageDetailType } from "@/lib/inbox/types";

/**
 * Outlook-like reading pane: use admin width up to ~1400px so ultrawide
 * desktops are not dominated by empty gutters, without full-bleed stretch.
 */
const READING_SHELL = "max-w-[1400px]";

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

/**
 * Detail-only srcdoc chrome for sandboxed HTML.
 * - Keeps inbox CSP (script-src 'none'); no scripts / no same-origin.
 * - Does NOT force a global font-size (preserves sender inline sizes).
 * - Centers typical fixed-width email tables in a wide pane (Gmail/Outlook feel).
 */
function wrapDetailEmailSrcDoc(sanitizedHtml: string): string {
  const styles = [
    "html{-webkit-text-size-adjust:100%;height:100%;}",
    /* No font-size here — avoid shrinking emails that inherit from body. */
    "body{margin:0;padding:20px 12px 28px;font-family:system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;color:#111;word-wrap:break-word;overflow-wrap:anywhere;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;}",
    "body>*{max-width:100%;}",
    "a{color:#0b3d5c;}",
    "table{border-collapse:collapse;}",
  ].join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="Content-Security-Policy" content="${INBOX_HTML_CSP}" /><style>${styles}</style></head><body>${sanitizedHtml}</body></html>`;
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
    <div className={cn(adminCardShellClass, "bg-white")}>
      {/* Compact Outlook-style command bar */}
      <div className="sticky top-0 z-10 border-b border-line/50 bg-white/95 backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8",
            READING_SHELL,
          )}
        >
          <Link
            href="/admin/posteingang"
            className={cn(
              adminSecondaryButtonClass,
              "h-8 rounded-md border-line/70 px-3 text-[11px] tracking-[0.04em]",
            )}
          >
            ← Posteingang
          </Link>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {message.isUnreadLocal ? (
              <span className="rounded-md bg-brand-yellow/30 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy uppercase">
                Ungelesen
              </span>
            ) : null}

            {canManage ? (
              <>
                <div
                  className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-line/60 bg-surface/60 p-0.5"
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
                          "h-7 rounded px-2.5 text-[10px] font-semibold tracking-[0.04em] uppercase transition-colors",
                          active
                            ? "bg-navy text-white"
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
                    "h-8 rounded-md px-3 text-[10px] tracking-[0.04em]",
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
              <span className="rounded-md bg-navy/5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-navy/80 uppercase">
                {INBOX_STATUS_LABEL[message.processingStatus]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Reading shell — wider on ultrawide, still capped */}
      <div className={cn("mx-auto w-full px-4 py-4 sm:px-6 sm:py-5 lg:px-8", READING_SHELL)}>
        {/* Subject */}
        <h1 className="text-[1.35rem] leading-snug font-semibold tracking-[-0.02em] text-ink sm:text-[1.65rem] sm:leading-tight">
          {message.subject || "(Kein Betreff)"}
        </h1>

        {/* Sender / recipients / date — Gmail-like density, Outlook clarity */}
        <header className="mt-3 flex gap-3 border-b border-line/50 pb-3.5 sm:mt-3.5 sm:pb-4">
          <InboxSenderAvatar
            fromName={message.fromName}
            fromAddress={message.fromAddress}
            unread={message.isUnreadLocal}
            size="md"
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <p className="min-w-0 truncate text-[14px] sm:text-[15px]">
                <span className="font-semibold tracking-[-0.01em] text-ink">{senderDisplay}</span>
                {message.fromName ? (
                  <span className="text-muted"> &lt;{message.fromAddress}&gt;</span>
                ) : null}
              </p>
              <time
                dateTime={message.receivedAt}
                className="shrink-0 text-[12px] text-muted tabular-nums"
              >
                {formatDateTimeDe(message.receivedAt)}
              </time>
            </div>
            <dl className="mt-1.5 space-y-0.5 text-[12px] text-ink/75">
              <div className="flex flex-wrap gap-x-1.5">
                <dt className="text-muted">An:</dt>
                <dd className="min-w-0 break-words">{toLine}</dd>
              </div>
              {ccLine ? (
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted">Cc:</dt>
                  <dd className="min-w-0 break-words">{ccLine}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        {/*
          Body iframe:
          - Tall viewport-based min-height reduces nested scrolling for typical mail
            (auto-height needs scripts / same-origin — intentionally not used).
          - Width fills the reading shell; email tables stay sender-sized and centered
            via srcdoc chrome.
        */}
        <section className="mt-4">
          <p className="mb-2 text-[11px] leading-4 text-muted">
            Externe Bilder und aktive Inhalte sind aus Sicherheitsgründen blockiert.
          </p>
          {message.bodyHtmlSanitized ? (
            <iframe
              className="block w-full border-0 bg-white min-h-[calc(100dvh-13.5rem)] sm:min-h-[calc(100dvh-12.5rem)]"
              // No scripts / no same-origin — inbox-only sandbox + CSP srcdoc.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              title="Nachrichtentext"
              srcDoc={wrapDetailEmailSrcDoc(message.bodyHtmlSanitized)}
            />
          ) : (
            <pre className="min-h-[calc(100dvh-16rem)] whitespace-pre-wrap text-[15px] leading-7 tracking-[-0.01em] text-ink">
              {message.bodyText || "Kein Textinhalt."}
            </pre>
          )}
        </section>

        {/* Compact attachment rows */}
        {message.attachments.length > 0 ? (
          <section className="mt-5 border-t border-line/50 pt-4">
            <div className="mb-2 flex items-center gap-2">
              <InboxAttachmentIcon className="text-navy/55" />
              <h2 className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                Anhänge
              </h2>
              <span className="text-[11px] font-semibold text-navy/55">
                {message.attachments.length}
              </span>
            </div>
            <ul className="divide-y divide-line/50 overflow-hidden rounded-lg border border-line/50 bg-surface/20">
              {message.attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 sm:px-3.5"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-navy ring-1 ring-inset ring-line/70"
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
                        "h-8 shrink-0 rounded-md px-3 text-[10px]",
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
