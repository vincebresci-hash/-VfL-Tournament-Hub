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
        "inline-flex px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase",
        tournamentStatusClassName[status],
        className,
      )}
    >
      {tournamentStatusLabel[status]}
    </span>
  );
}
