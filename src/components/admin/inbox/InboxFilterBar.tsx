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
      className={cn("border-b border-line bg-white px-4 py-3 sm:px-5", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Suche</span>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
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
            className={cn(adminFilterControlClass, "pl-9")}
            placeholder="Betreff, Absender…"
          />
        </label>

        <div
          className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface/50 p-1"
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
                  "h-8 rounded-md px-2.5 text-[11px] font-semibold tracking-[0.04em] uppercase transition-colors",
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

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-[13px] text-ink select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => onUnreadOnlyChange(event.target.checked)}
              className="rounded border-line text-navy focus:ring-brand-yellow"
            />
            Nur ungelesen
          </label>
          <button type="submit" className={adminSecondaryButtonClass}>
            Filtern
          </button>
        </div>
      </div>
    </form>
  );
}
