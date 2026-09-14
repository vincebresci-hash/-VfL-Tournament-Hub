import { adminStatusBadgeClass } from "@/components/admin/AdminPanel";
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
        adminStatusBadgeClass,
        clubRecordStatusClassName[status],
        className,
      )}
    >
      {clubRecordStatusLabel[status]}
    </span>
  );
}
