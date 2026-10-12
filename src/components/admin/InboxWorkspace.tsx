"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adminCardShellClass,
  adminCompactPrimaryButtonClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { InboxFilterBar } from "@/components/admin/inbox/InboxFilterBar";
import { InboxMessageList } from "@/components/admin/inbox/InboxMessageList";
import { InboxMessageDetailView } from "@/components/admin/InboxMessageDetail";
import { triggerInboxSyncAction } from "@/lib/inbox/actions";
import { formatDateTimeDe } from "@/lib/format";
import { cn } from "@/lib/cn";
import type {
  InboxMessageDetail,
  InboxMessageListItem,
  InboxProcessingStatus,
  InboxSyncStateView,
} from "@/lib/inbox/types";

type InboxWorkspaceProps = {
  messages: InboxMessageListItem[];
  syncState: InboxSyncStateView | null;
  canSync: boolean;
  canManage: boolean;
  initialQuery: string;
  initialStatus: InboxProcessingStatus | "all";
  initialUnreadOnly: boolean;
  /** SSR-selected detail for `/admin/posteingang/[id]`; null on the index route. */
  selectedMessage: InboxMessageDetail | null;
};

function buildInboxFilterQuery(input: {
  query: string;
  status: InboxProcessingStatus | "all";
  unreadOnly: boolean;
}): string {
  const params = new URLSearchParams();
  if (input.query.trim()) {
    params.set("q", input.query.trim());
  }
  if (input.status !== "all") {
    params.set("status", input.status);
  }
  if (input.unreadOnly) {
    params.set("unread", "1");
  }
  return params.toString();
}

function InboxReadingEmptyState() {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center px-8 py-16 text-center">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Lesebereich</p>
      <p className="mt-3 font-display text-[1.15rem] font-bold tracking-wide text-ink uppercase">
        Keine Nachricht ausgewählt
      </p>
      <p className="mt-2 max-w-sm text-[14px] leading-6 text-muted">
        Wählen Sie links eine E-Mail aus, um Betreff, Inhalt und Anhänge hier zu lesen.
      </p>
    </div>
  );
}

export function InboxWorkspace({
  messages,
  syncState,
  canSync,
  canManage,
  initialQuery,
  initialStatus,
  initialUnreadOnly,
  selectedMessage,
}: InboxWorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local draft state is reset when the parent remounts via `key` (filter/selection URL).
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [unreadOnly, setUnreadOnly] = useState(initialUnreadOnly);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const selectedId = selectedMessage?.id ?? null;
  const filterQs = buildInboxFilterQuery({ query, status, unreadOnly });
  const listHref = filterQs ? `/admin/posteingang?${filterQs}` : "/admin/posteingang";

  function messageHref(messageId: string): string {
    return filterQs
      ? `/admin/posteingang/${messageId}?${filterQs}`
      : `/admin/posteingang/${messageId}`;
  }

  function navigateWithFilters(next?: {
    query?: string;
    status?: InboxProcessingStatus | "all";
    unreadOnly?: boolean;
    messageId?: string | null;
  }) {
    const qs = buildInboxFilterQuery({
      query: next?.query ?? query,
      status: next?.status ?? status,
      unreadOnly: next?.unreadOnly ?? unreadOnly,
    });
    const messageId = next?.messageId === undefined ? selectedId : next.messageId;
    const path = messageId
      ? qs
        ? `/admin/posteingang/${messageId}?${qs}`
        : `/admin/posteingang/${messageId}`
      : qs
        ? `/admin/posteingang?${qs}`
        : "/admin/posteingang";
    startTransition(() => {
      router.replace(path);
    });
  }

  function selectMessage(messageId: string) {
    if (messageId === selectedId) {
      return;
    }
    startTransition(() => {
      router.replace(messageHref(messageId));
    });
  }

  function runSync() {
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
  }

  const unreadInView = messages.filter((message) => message.isUnreadLocal).length;

  return (
    <div
      className={cn(
        adminCardShellClass,
        "flex min-h-0 flex-col overflow-hidden bg-white",
        // Fill admin main on large screens for Outlook-like independent panes.
        "lg:h-[calc(100dvh-8rem)] lg:min-h-[36rem]",
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* List pane — full width on mobile when nothing selected; ~35% on desktop */}
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col border-line lg:w-[35%] lg:max-w-[28rem] lg:min-w-[18rem] lg:border-r",
            selectedId ? "hidden lg:flex" : "flex flex-1",
          )}
          aria-label="Nachrichtenliste"
        >
          <div className="shrink-0 border-b border-line bg-gradient-to-b from-surface/80 to-white px-4 py-4 sm:px-5 sm:py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                    Posteingang
                  </p>
                  <span className="rounded-md bg-navy/5 px-1.5 py-0.5 text-[11px] font-semibold text-navy/70">
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
                  className={adminPrimaryButtonClass}
                  onClick={runSync}
                >
                  {pending ? "Synchronisiere…" : "Jetzt synchronisieren"}
                </button>
              ) : null}
            </div>
          </div>

          <InboxFilterBar
            query={query}
            status={status}
            unreadOnly={unreadOnly}
            onQueryChange={setQuery}
            onStatusChange={(next) => {
              setStatus(next);
              navigateWithFilters({ status: next });
            }}
            onUnreadOnlyChange={(next) => {
              setUnreadOnly(next);
              navigateWithFilters({ unreadOnly: next });
            }}
            onSubmit={() => navigateWithFilters()}
          />

          <div className="min-h-0 flex-1 overflow-y-auto">
            <InboxMessageList
              messages={messages}
              selectedId={selectedId}
              getHref={(message) => messageHref(message.id)}
              onSelect={selectMessage}
            />
          </div>

          {canSync && messages.length > 8 ? (
            <div className="shrink-0 border-t border-line bg-surface/40 px-4 py-3 sm:hidden">
              <button
                type="button"
                disabled={pending}
                className={cn(adminCompactPrimaryButtonClass, "w-full")}
                onClick={runSync}
              >
                Synchronisieren
              </button>
            </div>
          ) : null}
        </section>

        {/* Reading pane — full width on mobile when selected; ~65% on desktop */}
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col bg-white",
            selectedId ? "flex flex-1" : "hidden lg:flex lg:flex-1",
          )}
          aria-label="Nachrichteninhalt"
        >
          {selectedMessage ? (
            <>
              <div className="flex shrink-0 items-center gap-2 border-b border-line/50 px-4 py-2 lg:hidden">
                <Link
                  href={listHref}
                  className={cn(
                    adminSecondaryButtonClass,
                    "h-8 rounded-md border-line/70 px-3 text-[11px] tracking-[0.04em]",
                  )}
                >
                  ← Posteingang
                </Link>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <InboxMessageDetailView
                  message={selectedMessage}
                  canManage={canManage}
                  variant="pane"
                  className="h-full min-h-0 border-0 shadow-none ring-0"
                />
              </div>
            </>
          ) : (
            <InboxReadingEmptyState />
          )}
        </section>
      </div>
    </div>
  );
}
