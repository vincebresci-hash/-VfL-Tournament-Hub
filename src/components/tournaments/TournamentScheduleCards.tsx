import { formatBerlinClock } from "@/lib/schedule/datetime";
import { teamLabel } from "@/lib/schedule/names";
import type { TournamentMatchRecord } from "@/types/schedule";

type TournamentScheduleCardsProps = {
  matches: TournamentMatchRecord[];
  teamLabels: Record<string, string>;
  matchTeamId: (
    applicationId: string | null,
    externalTeamId?: string | null,
  ) => string | null;
  phaseOrGroupLabel: (match: TournamentMatchRecord) => string;
  fieldLabel: (fieldId: string | null) => string;
};

/**
 * V2-C2 presentational Hub Spielplan list.
 * Receives already-ordered matches; no queries, sorting, or source selection.
 */
export function TournamentScheduleCards({
  matches,
  teamLabels,
  matchTeamId,
  phaseOrGroupLabel,
  fieldLabel,
}: TournamentScheduleCardsProps) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
          Spielplan
        </h2>
        <p className="text-[13px] font-medium tracking-wide text-muted">
          {matches.length} {matches.length === 1 ? "Spiel" : "Spiele"}
        </p>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-2.5">
        {matches.map((match) => {
          const home = teamLabel(
            teamLabels,
            matchTeamId(match.homeApplicationId, match.homeExternalTeamId),
          );
          const away = teamLabel(
            teamLabels,
            matchTeamId(match.awayApplicationId, match.awayExternalTeamId),
          );
          const showScore =
            match.status === "completed" &&
            match.homeScore != null &&
            match.awayScore != null;
          const scoreText = showScore
            ? `${match.homeScore} : ${match.awayScore}${
                match.decidedBy === "penalties"
                  ? ` n.E. ${match.homePenalties ?? 0}:${match.awayPenalties ?? 0}`
                  : ""
              }`
            : null;

          return (
            <li
              key={match.id}
              className="rounded-[10px] border border-line bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-base">
                  {formatBerlinClock(match.scheduledAt)}
                </p>
                <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {phaseOrGroupLabel(match)} · {fieldLabel(match.fieldId)}
                </p>
              </div>

              <div className="mt-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug font-medium text-ink">
                    {home}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    vs
                  </p>
                  <p className="mt-0.5 text-[14px] leading-snug font-medium text-ink">
                    {away}
                  </p>
                </div>
                <div className="shrink-0 pt-0.5 text-right">
                  {showScore ? (
                    <p className="font-display text-lg font-bold leading-none text-ink">
                      {scoreText}
                    </p>
                  ) : (
                    <p className="text-[12px] leading-snug text-muted">
                      Ergebnis folgt
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
