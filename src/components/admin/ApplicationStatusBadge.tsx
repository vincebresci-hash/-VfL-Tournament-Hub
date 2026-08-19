import { cn } from "@/lib/cn";
import { applicationStatusClassName, applicationStatusLabel } from "@/lib/admin";
import type { ApplicationStatus } from "@/types/application";

type ApplicationStatusBadgeProps = {
  status: ApplicationStatus;
  className?: string;
};

export function ApplicationStatusBadge({
  status,
  className,
}: ApplicationStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase",
        applicationStatusClassName[status],
        className,
      )}
    >
      {applicationStatusLabel[status]}
    </span>
  );
}
