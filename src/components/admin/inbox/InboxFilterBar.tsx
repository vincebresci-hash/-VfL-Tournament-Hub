"use client";

import {
  adminFilterControlClass,
  adminSecondaryButtonClass,
} from "@/components/admin/AdminPanel";
import { INBOX_STATUS_LABEL } from "@/components/admin/inbox/status";
import { cn } from "@/lib/cn";
import type { InboxProcessingStatus } from "@/lib/inbox/types";

export const INBOX_STATUS_FILTERS: Array<{
  value: InboxProcessingStatus | "all";
  label: string;
}> = [
  { value: "all", label: "Alle" },
  { value: "open", label: INBOX_STATUS_LABEL.open },
  { value: "in_progress", label: INBOX_STATUS_LABEL.in_progress },
  { value: "done", label: INBOX_STATUS_LABEL.done },
];

type InboxFilterBarProps = {
  query: string;
  status: InboxProcessingStatus | "all";
  unreadOnly: boolean;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: InboxProcessingStatus | "all") => void;
  onUnreadOnlyChange: (unreadOnly: boolean) => void;
  onSubmit: () => void;
  className?: string;
};

export function InboxFilterBar({
  query,
  status,
  unreadOnly,
  onQueryChange,
  onStatusChange,
  onUnreadOnlyChange,
  onSubmit,
  className,
}: InboxFilterBarProps) {
  return (
    <form
      className={cn("shrink-0 border-b border-line bg-white px-3 py-2.5 sm:px-3.5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {/*
        Always stacked: the list pane is ~440px, so a horizontal toolbar
        crushed the search icon into the status chips ("Offen").
      */}
      <div className="flex flex-col gap-2.5">
        <label className="relative block w-full min-w-0">
          <span className="sr-only">Suche</span>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-muted"
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
            onChange={(event) => onQueryChange(event.target.value)}
            className={cn(adminFilterControlClass, "relative z-0 w-full min-w-0 pl-9")}
            placeholder="Betreff, Absender…"
          />
        </label>

        <div
          className="flex w-full min-w-0 shrink-0 flex-wrap gap-1 rounded-lg border border-line bg-surface/50 p-1"
          role="group"
          aria-label="Status filtern"
        >
          {INBOX_STATUS_FILTERS.map((option) => {
            const active = status === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "h-8 min-w-0 shrink-0 rounded-md px-2 text-[10px] font-semibold tracking-[0.04em] uppercase transition-colors sm:px-2.5 sm:text-[11px]",
                  active
                    ? "bg-white text-navy shadow-sm ring-1 ring-line"
                    : "text-muted hover:text-ink",
                )}
                onClick={() => onStatusChange(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2">
          <label className="inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-[12px] text-ink select-none sm:h-10 sm:text-[13px]">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => onUnreadOnlyChange(event.target.checked)}
              className="shrink-0 rounded border-line text-navy focus:ring-brand-yellow"
            />
            <span className="truncate">Nur ungelesen</span>
          </label>
          <button
            type="submit"
            className={cn(adminSecondaryButtonClass, "h-9 shrink-0 px-3 text-[11px] sm:h-10")}
          >
            Filtern
          </button>
        </div>
      </div>
    </form>
  );
}
