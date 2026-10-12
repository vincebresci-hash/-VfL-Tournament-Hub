"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import {
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminStatusBadgeClass,
} from "@/components/admin/AdminPanel";
import {
  createInboxAttachmentDownloadUrlAction,
  markInboxMessageReadAction,
  updateInboxMessageLocalStateAction,
} from "@/lib/inbox/actions";
import { formatDateTimeDe } from "@/lib/format";
import { wrapInboxHtmlForSandbox } from "@/lib/inbox/sanitize-html";
import type { InboxMessageDetail as InboxMessageDetailType, InboxProcessingStatus } from "@/lib/inbox/types";

const statusLabel: Record<InboxProcessingStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
};

type InboxMessageDetailProps = {
  message: InboxMessageDetailType;
  canManage: boolean;
};

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/posteingang" className={adminSecondaryButtonClass}>
          ← Zurück zum Posteingang
        </Link>
        <span className={adminStatusBadgeClass}>{statusLabel[message.processingStatus]}</span>
      </div>

      <article className={`${adminCardShellClass} p-4 sm:p-6`}>
        <h1 className="font-display text-xl font-bold tracking-wide text-ink uppercase sm:text-2xl">
          {message.subject}
        </h1>
        <dl className="mt-4 grid gap-2 text-[13px] text-muted sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-ink">Von</dt>
            <dd>
              {message.fromName ? `${message.fromName} ` : ""}
              &lt;{message.fromAddress}&gt;
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Empfangen</dt>
            <dd>{formatDateTimeDe(message.receivedAt)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-ink">An</dt>
            <dd>
              {message.toAddresses.length
                ? message.toAddresses.map((entry) => entry.address).join(", ")
                : "—"}
            </dd>
          </div>
        </dl>

        {canManage ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {(["open", "in_progress", "done"] as const).map((status) => (
              <button
                key={status}
                type="button"
                disabled={pending || message.processingStatus === status}
                className={
                  message.processingStatus === status
                    ? adminPrimaryButtonClass
                    : adminSecondaryButtonClass
                }
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
                {statusLabel[status]}
              </button>
            ))}
            <button
              type="button"
              disabled={pending}
              className={adminSecondaryButtonClass}
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
      </article>

      <section className={`${adminCardShellClass} p-4 sm:p-6`}>
        <h2 className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
          Inhalt
        </h2>
        <p className="mt-2 text-[12px] text-muted">
          Externe Bilder und aktive Inhalte sind aus Sicherheitsgründen blockiert.
        </p>
        {message.bodyHtmlSanitized ? (
          <iframe
            className="mt-4 min-h-[240px] w-full border border-border bg-white"
            // No scripts / no same-origin — inbox-only sandbox + CSP srcdoc.
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            title="Nachrichtentext"
            srcDoc={wrapInboxHtmlForSandbox(message.bodyHtmlSanitized)}
          />
        ) : (
          <pre className="mt-4 whitespace-pre-wrap text-[14px] leading-6 text-ink">
            {message.bodyText || "Kein Textinhalt."}
          </pre>
        )}
      </section>

      {message.attachments.length > 0 ? (
        <section className={`${adminCardShellClass} p-4 sm:p-6`}>
          <h2 className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
            Anhänge
          </h2>
          <ul className="mt-3 space-y-2">
            {message.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2"
              >
                <div>
                  <p className="text-[14px] font-semibold text-ink">{attachment.filename}</p>
                  <p className="text-[12px] text-muted">
                    {attachment.contentType ?? "unbekannt"} · {attachment.sizeBytes} Bytes
                    {!attachment.stored
                      ? ` · nicht gespeichert${attachment.skipReason ? ` (${attachment.skipReason})` : ""}`
                      : ""}
                  </p>
                </div>
                {attachment.stored ? (
                  <button
                    type="button"
                    className={adminSecondaryButtonClass}
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
