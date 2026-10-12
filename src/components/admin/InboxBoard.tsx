"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AdminEmpty,
  adminCardShellClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminStatusBadgeClass,
} from "@/components/admin/AdminPanel";
import { triggerInboxSyncAction } from "@/lib/inbox/actions";
import { formatDateTimeDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { InboxMessageListItem, InboxProcessingStatus, InboxSyncStateView } from "@/lib/inbox/types";

const statusLabel: Record<InboxProcessingStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
};

type InboxBoardProps = {
  messages: InboxMessageListItem[];
  syncState: InboxSyncStateView | null;
  canSync: boolean;
  initialQuery: string;
  initialStatus: InboxProcessingStatus | "all";
  initialUnreadOnly: boolean;
};

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

  return (
    <div className="space-y-5">
      <div className={`${adminCardShellClass} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
              Synchronisation
            </p>
            <p className="mt-1 text-[14px] text-ink">
              {syncState?.lastSuccessAt
                ? `Zuletzt erfolgreich: ${formatDateTimeDe(syncState.lastSuccessAt)}`
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
          </div>
          {canSync ? (
            <button
              type="button"
              disabled={pending}
              className={adminPrimaryButtonClass}
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
              Jetzt synchronisieren
            </button>
          ) : null}
        </div>
        {syncMessage ? <p className="mt-3 text-[13px] text-muted">{syncMessage}</p> : null}
      </div>

      <form
        className={`${adminCardShellClass} grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end sm:p-5`}
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <label className="block text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
          Suche
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1.5 w-full border border-border bg-white px-3 py-2 text-[14px] text-ink"
            placeholder="Betreff, Absender…"
          />
        </label>
        <label className="block text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
          Status
          <select
            value={status}
            onChange={(event) => {
              const value = event.target.value as InboxProcessingStatus | "all";
              setStatus(value);
              applyFilters({ status: value });
            }}
            className="mt-1.5 w-full border border-border bg-white px-3 py-2 text-[14px] text-ink"
          >
            <option value="all">Alle</option>
            <option value="open">Offen</option>
            <option value="in_progress">In Bearbeitung</option>
            <option value="done">Erledigt</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              applyFilters({ unreadOnly: event.target.checked });
            }}
          />
          Nur ungelesen
        </label>
        <button type="submit" className={adminSecondaryButtonClass}>
          Filtern
        </button>
      </form>

      {messages.length === 0 ? (
        <AdminEmpty>Keine Nachrichten gefunden.</AdminEmpty>
      ) : (
        <div className="grid gap-2">
          {messages.map((message) => (
            <Link
              key={message.id}
              href={`/admin/posteingang/${message.id}`}
              className={cn(
                adminCardShellClass,
                "block p-4 transition-colors hover:border-navy/25 sm:p-5",
                message.isUnreadLocal && "border-l-4 border-l-brand-yellow",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-lg">
                    {message.subject}
                  </p>
                  <p className="mt-1 truncate text-[13px] text-muted">
                    {message.fromName || message.fromAddress}
                    {message.fromName ? ` · ${message.fromAddress}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[12px] text-muted">
                    {formatDateTimeDe(message.receivedAt)}
                  </span>
                  <span className={adminStatusBadgeClass}>{statusLabel[message.processingStatus]}</span>
                </div>
              </div>
              {message.snippet ? (
                <p className="mt-2 line-clamp-2 text-[13px] text-muted">{message.snippet}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
