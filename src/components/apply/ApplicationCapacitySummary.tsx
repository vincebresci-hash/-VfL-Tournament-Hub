import { getApplicationCapacityDisplay } from "@/lib/application-capacity-display";
import type { PublicApplicationState } from "@/lib/public-application-state";

type ApplicationCapacitySummaryProps = {
  maxTeams: number | null;
  confirmedTeams: number;
  applicationState: PublicApplicationState;
};

export function ApplicationCapacitySummary({
  maxTeams,
  confirmedTeams,
  applicationState,
}: ApplicationCapacitySummaryProps) {
  const display = getApplicationCapacityDisplay({
    maxTeams,
    confirmedTeams,
    applicationState,
  });

  if (!display) {
    return null;
  }

  return (
    <div className="border-t border-line pt-4">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
        {display.heading}
      </p>
      <p className="mt-2 text-[13px] font-medium text-ink">{display.participantLine}</p>
      <p className="mt-1 text-[13px] text-muted">{display.statusLine}</p>
    </div>
  );
}
