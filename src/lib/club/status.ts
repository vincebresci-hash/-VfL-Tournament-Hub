import { cn } from "@/lib/cn";
import type { ApplicationStatus } from "@/types/application";

export const clubApplicationStatusLabel: Record<ApplicationStatus, string> = {
  new: "Eingegangen",
  "under-review": "In Prüfung",
  accepted: "Angenommen",
  "waiting-list": "Warteliste",
  rejected: "Abgelehnt",
  cancelled: "Abgesagt",
};

export const clubApplicationStatusClassName: Record<ApplicationStatus, string> = {
  new: "bg-brand-yellow text-navy",
  "under-review": "bg-brand-blue/10 text-brand-blue",
  accepted: "bg-navy text-white/86",
  "waiting-list": "bg-[#eceef2] text-ink",
  rejected: "bg-[#e8eaee] text-muted",
  cancelled: "bg-[#f2e8e8] text-[#8a3b3b]",
};

export function clubStatusBadgeClassName(status: ApplicationStatus) {
  return cn(
    "inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase",
    clubApplicationStatusClassName[status],
  );
}
