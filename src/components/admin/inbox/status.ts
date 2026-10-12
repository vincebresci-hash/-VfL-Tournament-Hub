import type { InboxProcessingStatus } from "@/lib/inbox/types";
import { adminStatusBadgeClass } from "@/components/admin/AdminPanel";
import { cn } from "@/lib/cn";

export const INBOX_STATUS_LABEL: Record<InboxProcessingStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  done: "Erledigt",
};

const STATUS_TONE: Record<InboxProcessingStatus, string> = {
  open: "rounded-full bg-[#eef4fb] text-navy ring-1 ring-inset ring-navy/10",
  in_progress: "rounded-full bg-[#fff7db] text-[#6b5300] ring-1 ring-inset ring-brand-yellow/45",
  done: "rounded-full bg-[#eef7f0] text-[#1f6b3a] ring-1 ring-inset ring-[#1f6b3a]/15",
};

export function inboxStatusBadgeClass(status: InboxProcessingStatus): string {
  return cn(adminStatusBadgeClass, STATUS_TONE[status]);
}

export function inboxSenderInitials(fromName: string, fromAddress: string): string {
  const source = (fromName || fromAddress || "?").trim();
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
