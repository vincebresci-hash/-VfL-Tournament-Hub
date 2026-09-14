import { adminStatusBadgeClass } from "@/components/admin/AdminPanel";
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
        adminStatusBadgeClass,
        applicationStatusClassName[status],
        className,
      )}
    >
      {applicationStatusLabel[status]}
    </span>
  );
}
