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
 * Ultrawide-friendly reading column for the standalone detail route.
 * Pane mode skips this cap so the embedded reader can fill its column.
 */
const READING_SHELL = "max-w-[1600px]";

export type InboxMessageDetailVariant = "page" | "pane";

type InboxMessageDetailProps = {
  message: InboxMessageDetailType;
  canManage: boolean;
  /**
   * `page` — standalone `/admin/posteingang/[id]` (default, current UX).
   * `pane` — prepared for a future embedded two-pane reader (not used by routes yet).
   */
  variant?: InboxMessageDetailVariant;
  className?: string;
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
 *
 * Security: reuses INBOX_HTML_CSP (script-src 'none'); iframe stays without
 * allow-scripts / allow-same-origin.
 *
 * Typography: sanitization strips style/width/font tags, so an 18px body
 * baseline is presentation chrome for unstyled HTML — not a rewrite of
 * surviving semantic structure.
 *
 * Tables: only common top-level layout tables are expanded to the pane.
 * Nested tables keep intrinsic width (not a blanket width:100%).
 */
function wrapDetailEmailSrcDoc(sanitizedHtml: string): string {
  const styles = [
    "html{-webkit-text-size-adjust:100%;}",
    "body{margin:0;padding:8px 4px 24px;font-family:system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;font-size:18px;line-height:1.6;color:#111;word-wrap:break-word;overflow-wrap:anywhere;overflow-x:auto;}",
    "a{color:#0b3d5c;}",
    "table{border-collapse:collapse;max-width:100%;}",
    /* Top-level / single-root layout tables only — nested tables stay auto. */
    "body>table{width:100%;max-width:100%;}",
    "body>div:only-child>table:only-child{width:100%;max-width:100%;}",
    "table table{width:auto;max-width:100%;}",
    "td,th{word-break:break-word;}",
    /* Readable measure for free-flow paragraphs in a wide pane. */
    "body>p{max-width:72ch;}",
    "pre,code{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.9375em;}",
    "p{margin:0 0 0.85em;}",
    "p:last-child{margin-bottom:0;}",
  ].join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta http-equiv="Content-Security-Policy" content="${INBOX_HTML_CSP}" /><style>${styles}</style></head><body>${sanitizedHtml}</body></html>`;
}

export function InboxMessageDetailView({
  message,
  canManage,
  variant = "page",
  className,
}: InboxMessageDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isPane = variant === "pane";

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
        !isPane && adminCardShellClass,
        "flex flex-col bg-white",
        // Page: full-route Outlook height. Pane: fill the future reading column.
        isPane ? "h-full min-h-0" : "lg:h-[calc(100dvh-8rem)] lg:min-h-[36rem]",
        className,
      )}
    >
      {/* Compact Outlook-style command bar */}
      <div className="sticky top-0 z-10 shrink-0 border-b border-line/50 bg-white/95 backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8",
            !isPane && READING_SHELL,
          )}
        >
          {!isPane ? (
            <Link
              href="/admin/posteingang"
              className={cn(
                adminSecondaryButtonClass,
                "h-8 rounded-md border-line/70 px-3 text-[11px] tracking-[0.04em]",
              )}
            >
              ← Posteingang
            </Link>
          ) : (
            <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              Nachricht
            </span>
          )}

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

      <div
        className={cn(
          "mx-auto flex min-h-0 w-full flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 lg:px-8",
          !isPane && READING_SHELL,
        )}
      >
        <div className="shrink-0">
          {/* Subject — primary headline */}
          <h1 className="text-[1.4rem] leading-snug font-semibold tracking-[-0.02em] text-ink sm:text-[1.7rem] sm:leading-tight">
            {message.subject || "(Kein Betreff)"}
          </h1>

          {/* Sender / recipients / date — clearer hierarchy */}
          <header className="mt-4 flex gap-3.5 border-b border-line/50 pb-4 sm:mt-5 sm:gap-4 sm:pb-5">
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
                    <p className="mt-0.5 truncate text-[13px] text-muted sm:text-[14px]">
                      {message.fromAddress}
                    </p>
                  ) : null}
                </div>
                <time
                  dateTime={message.receivedAt}
                  className="shrink-0 text-[13px] text-muted tabular-nums sm:text-[14px]"
                >
                  {formatDateTimeDe(message.receivedAt)}
                </time>
              </div>
              <dl className="mt-2.5 space-y-1 text-[13px] sm:text-[14px]">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="shrink-0 font-medium text-muted">An</dt>
                  <dd className="min-w-0 break-words text-ink/85">{toLine}</dd>
                </div>
                {ccLine ? (
                  <div className="flex flex-wrap gap-x-2">
                    <dt className="shrink-0 font-medium text-muted">Cc</dt>
                    <dd className="min-w-0 break-words text-ink/85">{ccLine}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </header>
        </div>

        {/*
          Body iframe — Outlook-style reading pane:
          - On lg+, flex-1 fills remaining card height (single primary scroll).
          - Auto-height would need scripts / same-origin — intentionally unused.
        */}
        <section className="mt-4 flex min-h-0 flex-1 flex-col sm:mt-5">
          <p className="mb-2 shrink-0 text-[11px] leading-4 text-muted">
            Externe Bilder und aktive Inhalte sind aus Sicherheitsgründen blockiert.
          </p>
          {message.bodyHtmlSanitized ? (
            <iframe
              className="block w-full min-h-[20rem] flex-1 border-0 bg-white lg:min-h-0"
              // No scripts / no same-origin — inbox-only sandbox + CSP srcdoc.
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              title="Nachrichtentext"
              srcDoc={wrapDetailEmailSrcDoc(message.bodyHtmlSanitized)}
            />
          ) : (
            <pre className="min-h-[20rem] flex-1 overflow-auto whitespace-pre-wrap font-sans text-[18px] leading-[1.6] tracking-[-0.01em] text-ink lg:min-h-0">
              {message.bodyText || "Kein Textinhalt."}
            </pre>
          )}
        </section>

        {/* Compact attachment rows */}
        {message.attachments.length > 0 ? (
          <section className="mt-4 shrink-0 border-t border-line/50 pt-4 sm:mt-5">
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
