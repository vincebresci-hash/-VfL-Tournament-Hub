"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminCardShellClass,
  adminCompactPrimaryButtonClass,
  adminFilterControlClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { InboxAttachmentIcon } from "@/components/admin/inbox/InboxAttachmentIcon";
import { InboxSenderAvatar } from "@/components/admin/inbox/InboxSenderAvatar";
import { InboxStatusBadge } from "@/components/admin/inbox/InboxStatusBadge";
import { INBOX_STATUS_LABEL } from "@/components/admin/inbox/status";
import { triggerInboxSyncAction } from "@/lib/inbox/actions";
import { formatDateTimeDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { InboxMessageListItem, InboxProcessingStatus, InboxSyncStateView } from "@/lib/inbox/types";

type InboxBoardProps = {
  messages: InboxMessageListItem[];
  syncState: InboxSyncStateView | null;
  canSync: boolean;
  initialQuery: string;
  initialStatus: InboxProcessingStatus | "all";
  initialUnreadOnly: boolean;
};

const STATUS_FILTERS: Array<{ value: InboxProcessingStatus | "all"; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "open", label: INBOX_STATUS_LABEL.open },
  { value: "in_progress", label: INBOX_STATUS_LABEL.in_progress },
  { value: "done", label: INBOX_STATUS_LABEL.done },
];

function formatListTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return formatDateTimeDe(iso);
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function InboxBoard({
  messages,
  syncState,
  canSync,
  initialQuery,
  initialStatus,
  initialUnreadOnly,
}: InboxBoardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [unreadOnly, setUnreadOnly] = useState(initialUnreadOnly);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  function applyFilters(next?: {
    query?: string;
    status?: InboxProcessingStatus | "all";
    unreadOnly?: boolean;
  }) {
    const params = new URLSearchParams();
    const q = next?.query ?? query;
    const s = next?.status ?? status;
    const u = next?.unreadOnly ?? unreadOnly;
    if (q.trim()) params.set("q", q.trim());
    if (s !== "all") params.set("status", s);
    if (u) params.set("unread", "1");
    const qs = params.toString();
    router.push(qs ? `/admin/posteingang?${qs}` : "/admin/posteingang");
  }

  const unreadInView = messages.filter((message) => message.isUnreadLocal).length;

  return (
    <div
      className={cn(
        adminCardShellClass,
        "overflow-hidden bg-[#f7f8fa] shadow-[0_1px_3px_rgba(16,24,40,0.06)]",
      )}
    >
      {/* Sync + workspace header */}
      <div className="border-b border-line/80 bg-white/90 px-4 py-4 backdrop-blur-sm sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold tracking-[-0.01em] text-ink">
                Posteingang
              </p>
              <span className="rounded-full bg-navy/5 px-2 py-0.5 text-[11px] font-semibold text-navy/70">
                {messages.length} {messages.length === 1 ? "Nachricht" : "Nachrichten"}
                {unreadInView > 0 ? ` · ${unreadInView} ungelesen` : ""}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-muted">
              {syncState?.lastSuccessAt
                ? `Zuletzt synchronisiert: ${formatDateTimeDe(syncState.lastSuccessAt)}`
                : "Noch keine erfolgreiche Synchronisation."}
            </p>
            {syncState?.lastError ? (
              <p className="mt-1 text-[13px] text-[#9a2b2b]">{syncState.lastError}</p>
            ) : null}
            {syncState && !syncState.backfillComplete ? (
              <p className="mt-1 text-[13px] text-muted">
                Erstimport (90 Tage) läuft noch — Synchronisation ggf. mehrfach auslösen.
              </p>
            ) : null}
            {syncMessage ? (
              <p className="mt-1.5 text-[13px] text-navy/80">{syncMessage}</p>
            ) : null}
          </div>
          {canSync ? (
            <button
              type="button"
              disabled={pending}
              className={cn(adminPrimaryButtonClass, "rounded-full")}
              onClick={() => {
                setSyncMessage(null);
                startTransition(async () => {
                  const result = await triggerInboxSyncAction();
                  if (!result.ok) {
                    setSyncMessage(result.error ?? "Sync fehlgeschlagen.");
                    return;
                  }
                  const batch = result.result;
                  setSyncMessage(
                    batch?.skippedLocked
                      ? "Synchronisation übersprungen (Lock aktiv)."
                      : `Sync: ${batch?.stored ?? 0} gespeichert` +
                          (batch?.timedOut ? " (Zeitbudget — bitte erneut auslösen)." : "."),
                  );
                  router.refresh();
                });
              }}
            >
              {pending ? "Synchronisiere…" : "Jetzt synchronisieren"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Filters */}
      <form
        className="border-b border-line/80 bg-white px-4 py-3 sm:px-5"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Suche</span>
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M13 13l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={cn(adminFilterControlClass, "rounded-full border-line/80 pl-10")}
              placeholder="Betreff, Absender…"
            />
          </label>

          <div
            className="flex flex-wrap gap-0.5 rounded-full border border-line/80 bg-[#f2f3f5] p-0.5"
            role="group"
            aria-label="Status filtern"
          >
            {STATUS_FILTERS.map((option) => {
              const active = status === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "h-8 rounded-full px-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase transition-colors",
                    active
                      ? "bg-white text-navy shadow-sm ring-1 ring-line/80"
                      : "text-muted hover:text-ink",
                  )}
                  onClick={() => {
                    setStatus(option.value);
                    applyFilters({ status: option.value });
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line/80 bg-white px-3.5 text-[13px] text-ink select-none">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => {
                  setUnreadOnly(event.target.checked);
                  applyFilters({ unreadOnly: event.target.checked });
                }}
                className="rounded border-line text-navy focus:ring-brand-yellow"
              />
              Nur ungelesen
            </label>
            <button type="submit" className={cn(adminSecondaryButtonClass, "rounded-full")}>
              Filtern
            </button>
          </div>
        </div>
      </form>

      {/* Message list */}
      {messages.length === 0 ? (
        <div className="bg-white px-5 py-16 text-center">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Keine Nachrichten
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] leading-6 text-muted">
            Keine Treffer für die aktuelle Suche und Filter. Synchronisieren Sie erneut oder
            setzen Sie die Filter zurück.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line/70 bg-white">
          {messages.map((message) => {
            const sender = message.fromName || message.fromAddress;
            return (
              <li key={message.id}>
                <Link
                  href={`/admin/posteingang/${message.id}`}
                  className={cn(
                    "group relative flex gap-3 px-4 py-3.5 transition-colors sm:gap-3.5 sm:px-5",
                    "hover:bg-[#f3f5f8] focus-visible:bg-[#f3f5f8] focus-visible:outline-none",
                    message.isUnreadLocal ? "bg-[#fffdf5]" : "bg-white",
                  )}
                >
                  {message.isUnreadLocal ? (
                    <span
                      aria-hidden
                      className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full bg-brand-yellow"
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p
                            className={cn(
                              "truncate text-[14px] tracking-[-0.01em]",
                              message.isUnreadLocal
                                ? "font-semibold text-ink"
                                : "font-medium text-ink/90",
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
                            "mt-0.5 truncate text-[14px] tracking-[-0.01em] sm:text-[15px]",
                            message.isUnreadLocal
                              ? "font-semibold text-ink"
                              : "font-medium text-ink/85",
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
                            message.isUnreadLocal
                              ? "font-semibold text-navy"
                              : "text-muted",
                          )}
                        >
                          {formatListTimestamp(message.receivedAt)}
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
          })}
        </ul>
      )}

      {/* Mobile-friendly hint when sync available but list scrolled — compact CTA echo */}
      {canSync && messages.length > 8 ? (
        <div className="border-t border-line/80 bg-white px-4 py-3 sm:hidden">
          <button
            type="button"
            disabled={pending}
            className={cn(adminCompactPrimaryButtonClass, "w-full rounded-full")}
            onClick={() => {
              setSyncMessage(null);
              startTransition(async () => {
                const result = await triggerInboxSyncAction();
                if (!result.ok) {
                  setSyncMessage(result.error ?? "Sync fehlgeschlagen.");
                  return;
                }
                const batch = result.result;
                setSyncMessage(
                  batch?.skippedLocked
                    ? "Synchronisation übersprungen (Lock aktiv)."
                    : `Sync: ${batch?.stored ?? 0} gespeichert` +
                        (batch?.timedOut ? " (Zeitbudget — bitte erneut auslösen)." : "."),
                );
                router.refresh();
              });
            }}
          >
            Synchronisieren
          </button>
        </div>
      ) : null}
    </div>
  );
}
