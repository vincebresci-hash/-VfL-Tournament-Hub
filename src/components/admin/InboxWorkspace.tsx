"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  adminCardShellClass,
  adminCompactPrimaryButtonClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { InboxFilterBar } from "@/components/admin/inbox/InboxFilterBar";
import { InboxMessageList } from "@/components/admin/inbox/InboxMessageList";
import {
  InboxMessageDetailView,
  type InboxDetailLocalStatePatch,
} from "@/components/admin/InboxMessageDetail";
import {
  getInboxMessageDetailAction,
  triggerInboxSyncAction,
} from "@/lib/inbox/actions";
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
  /** Authenticated actor for composer session draft scoping. */
  actorId?: string;
  /** IONOS SMTP reply (inbox.reply). */
  canReply?: boolean;
  initialQuery: string;
  initialStatus: InboxProcessingStatus | "all";
  initialUnreadOnly: boolean;
  /** SSR-selected detail for `/admin/posteingang/[id]`; null on the index route. */
  selectedMessage: InboxMessageDetail | null;
};

type ListPatch = {
  isUnreadLocal?: boolean;
  processingStatus?: InboxProcessingStatus;
};

type HistoryMode = "push" | "replace" | "none";

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

function parseSelectedIdFromPath(pathname: string): string | null {
  const match = /^\/admin\/posteingang\/([^/]+)$/.exec(pathname);
  return match?.[1] ?? null;
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
  actorId = "",
  canReply = false,
  initialQuery,
  initialStatus,
  initialUnreadOnly,
  selectedMessage,
}: InboxWorkspaceProps) {
  const router = useRouter();
  const [syncPending, startSyncTransition] = useTransition();
  const [, startDetailTransition] = useTransition();
  const [filterPending, startFilterTransition] = useTransition();
  const [detailLoading, setDetailLoading] = useState(false);
  // Local draft state is reset when the parent remounts via filter `key`.
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [unreadOnly, setUnreadOnly] = useState(initialUnreadOnly);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [activeDetail, setActiveDetail] = useState<InboxMessageDetail | null>(selectedMessage);
  const [highlightedId, setHighlightedId] = useState<string | null>(selectedMessage?.id ?? null);
  const [listPatches, setListPatches] = useState<Record<string, ListPatch>>({});
  const detailRequestSeq = useRef(0);
  const activeDetailIdRef = useRef<string | null>(selectedMessage?.id ?? null);

  useEffect(() => {
    activeDetailIdRef.current = activeDetail?.id ?? null;
  }, [activeDetail?.id]);

  const selectedId = highlightedId;
  const filterQs = buildInboxFilterQuery({ query, status, unreadOnly });
  const listHref = filterQs ? `/admin/posteingang?${filterQs}` : "/admin/posteingang";

  function messageHref(messageId: string): string {
    return filterQs
      ? `/admin/posteingang/${messageId}?${filterQs}`
      : `/admin/posteingang/${messageId}`;
  }

  const displayMessages = useMemo(() => {
    return messages
      .map((message) => {
        const patch = listPatches[message.id];
        return patch ? { ...message, ...patch } : message;
      })
      .filter((message) => {
        if (status !== "all" && message.processingStatus !== status) {
          return false;
        }
        if (unreadOnly && !message.isUnreadLocal) {
          return false;
        }
        return true;
      });
  }, [messages, listPatches, status, unreadOnly]);

  const handleLocalStateChange = useCallback((patch: InboxDetailLocalStatePatch) => {
    setListPatches((current) => ({
      ...current,
      [patch.messageId]: {
        ...current[patch.messageId],
        ...(patch.isUnreadLocal !== undefined ? { isUnreadLocal: patch.isUnreadLocal } : {}),
        ...(patch.processingStatus !== undefined
          ? { processingStatus: patch.processingStatus }
          : {}),
      },
    }));
    setActiveDetail((current) => {
      if (!current || current.id !== patch.messageId) {
        return current;
      }
      return {
        ...current,
        ...(patch.isUnreadLocal !== undefined ? { isUnreadLocal: patch.isUnreadLocal } : {}),
        ...(patch.processingStatus !== undefined
          ? { processingStatus: patch.processingStatus }
          : {}),
      };
    });
  }, []);

  const loadDetail = useCallback(
    (messageId: string, historyMode: HistoryMode) => {
      if (messageId === activeDetailIdRef.current && highlightedId === messageId) {
        return;
      }

      setHighlightedId(messageId);
      const seq = ++detailRequestSeq.current;
      setDetailLoading(true);

      startDetailTransition(async () => {
        const result = await getInboxMessageDetailAction(messageId);
        if (seq !== detailRequestSeq.current) {
          return;
        }
        setDetailLoading(false);

        if (!result.message) {
          setHighlightedId(activeDetailIdRef.current);
          return;
        }

        setActiveDetail(result.message);
        activeDetailIdRef.current = result.message.id;

        if (historyMode === "none") {
          return;
        }

        const href = messageHref(result.message.id);
        const state = { ...(window.history.state as object), inboxMessageId: result.message.id };
        if (historyMode === "push") {
          window.history.pushState(state, "", href);
        } else {
          window.history.replaceState(state, "", href);
        }
      });
    },
    // messageHref depends on filterQs from closure — remount on filter key keeps this fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterQs captured via messageHref
    [highlightedId, filterQs],
  );

  // Sync UI when the user uses browser back/forward after pushState/replaceState selection.
  useEffect(() => {
    function onPopState() {
      const id = parseSelectedIdFromPath(window.location.pathname);
      if (id) {
        loadDetail(id, "none");
        return;
      }
      detailRequestSeq.current += 1;
      setDetailLoading(false);
      setActiveDetail(null);
      setHighlightedId(null);
      activeDetailIdRef.current = null;
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadDetail]);

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
    // Filter changes intentionally use Next navigation to refetch the list.
    startFilterTransition(() => {
      router.replace(path);
    });
  }

  /**
   * Selection loads detail only (server action + history URL update).
   * Does not call triggerInboxSyncAction, router.refresh, or RSC list/sync refetch.
   */
  function selectMessage(messageId: string) {
    const historyMode: HistoryMode = activeDetailIdRef.current ? "replace" : "push";
    loadDetail(messageId, historyMode);
  }

  function runSync() {
    setSyncMessage(null);
    startSyncTransition(async () => {
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
      setListPatches({});
      router.refresh();
    });
  }

  const unreadInView = displayMessages.filter((message) => message.isUnreadLocal).length;
  const showDetailLoading = detailLoading && highlightedId !== activeDetail?.id;

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
        {/* List pane — ~440px on desktop (clamped for smaller viewports); full width on mobile */}
        <section
          className={cn(
            // Desktop: fixed ~440px column (clamp). Never flex-grow — that made the
            // list widen when the empty reading pane shared the row (flex-1 on both).
            "flex min-h-0 min-w-0 flex-col border-line lg:w-[clamp(17.5rem,40%,27.5rem)] lg:shrink-0 lg:grow-0 lg:border-r",
            // Mobile: list fills when nothing selected; hide when reading.
            // lg:flex-none cancels mobile flex-1 so width stays clamped on desktop.
            selectedId ? "hidden lg:flex" : "flex flex-1 lg:flex-none",
          )}
          aria-label="Nachrichtenliste"
        >
          <div className="shrink-0 border-b border-line bg-gradient-to-b from-surface/70 to-white px-3 py-3 sm:px-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                    Posteingang
                  </p>
                  <span className="rounded-md bg-navy/5 px-1.5 py-0.5 text-[11px] font-semibold text-navy/70">
                    {displayMessages.length}{" "}
                    {displayMessages.length === 1 ? "Nachricht" : "Nachrichten"}
                    {unreadInView > 0 ? ` · ${unreadInView} ungelesen` : ""}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-4 text-muted">
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
                  disabled={syncPending}
                  className={adminPrimaryButtonClass}
                  onClick={runSync}
                >
                  {syncPending ? "Synchronisiere…" : "Jetzt synchronisieren"}
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

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto",
              filterPending && "opacity-95",
            )}
          >
            <InboxMessageList
              messages={displayMessages}
              selectedId={selectedId}
              getHref={(message) => messageHref(message.id)}
              onSelect={selectMessage}
            />
          </div>

          {canSync && displayMessages.length > 8 ? (
            <div className="shrink-0 border-t border-line bg-surface/40 px-4 py-3 sm:hidden">
              <button
                type="button"
                disabled={syncPending}
                className={cn(adminCompactPrimaryButtonClass, "w-full")}
                onClick={runSync}
              >
                {syncPending ? "Synchronisiere…" : "Synchronisieren"}
              </button>
            </div>
          ) : null}
        </section>

        {/* Reading pane — flexible remainder of the workspace */}
        <section
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col bg-white",
            selectedId ? "flex" : "hidden lg:flex",
          )}
          aria-label="Nachrichteninhalt"
          aria-busy={showDetailLoading || undefined}
        >
          {showDetailLoading ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-line/60 bg-white/90 px-4 py-2 text-[12px] text-muted backdrop-blur-sm">
              Nachricht wird geladen…
            </div>
          ) : null}
          {activeDetail ? (
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
                  key={activeDetail.id}
                  message={activeDetail}
                  canManage={canManage}
                  actorId={actorId}
                  canReply={canReply}
                  variant="pane"
                  className="h-full min-h-0 border-0 shadow-none ring-0"
                  onLocalStateChange={handleLocalStateChange}
                  onDetailReload={(next) => {
                    if (next.id !== activeDetailIdRef.current) {
                      return;
                    }
                    setActiveDetail(next);
                  }}
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
