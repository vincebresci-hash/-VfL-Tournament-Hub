import { adminStatusBadgeClass } from "@/components/admin/AdminPanel";
import { cn } from "@/lib/cn";
import { tournamentStatusClassName, tournamentStatusLabel } from "@/lib/tournament-status";
import type { TournamentStatus } from "@/types/tournament";

type StatusBadgeProps = {
  status: TournamentStatus;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        adminStatusBadgeClass,
        tournamentStatusClassName[status],
        className,
      )}
    >
      {tournamentStatusLabel[status]}
    </span>
  );
}
