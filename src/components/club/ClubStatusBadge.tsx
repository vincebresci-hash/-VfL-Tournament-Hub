import { clubStatusBadgeClassName, clubApplicationStatusLabel } from "@/lib/club/status";
import { cn } from "@/lib/cn";
import type { ApplicationStatus } from "@/types/application";

type ClubStatusBadgeProps = {
  status: ApplicationStatus;
  className?: string;
};

export function ClubStatusBadge({ status, className }: ClubStatusBadgeProps) {
  return (
    <span className={cn(clubStatusBadgeClassName(status), className)}>
      {clubApplicationStatusLabel[status]}
    </span>
  );
}
