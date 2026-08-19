import { cn } from "@/lib/cn";
import { clubRecordStatusClassName, clubRecordStatusLabel } from "@/lib/admin";
import type { ClubRecordStatus } from "@/types/admin";

type ClubRecordStatusBadgeProps = {
  status: ClubRecordStatus;
  className?: string;
};

export function ClubRecordStatusBadge({
  status,
  className,
}: ClubRecordStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase",
        clubRecordStatusClassName[status],
        className,
      )}
    >
      {clubRecordStatusLabel[status]}
    </span>
  );
}
