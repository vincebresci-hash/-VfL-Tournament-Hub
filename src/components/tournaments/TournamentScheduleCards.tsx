import { MatchSidesScoreBlock } from "@/components/tournaments/MatchSidesScoreBlock";
import { type TeamMark } from "@/components/tournaments/TeamNameWithLogo";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import { teamLabel } from "@/lib/schedule/names";
import type { TournamentMatchRecord } from "@/types/schedule";

type TournamentScheduleCardsProps = {
  matches: TournamentMatchRecord[];
  teamLabels: Record<string, string>;
  teamMarks?: Record<string, TeamMark>;
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
  teamMarks,
  matchTeamId,
  phaseOrGroupLabel,
  fieldLabel,
}: TournamentScheduleCardsProps) {
  if (matches.length === 0) {
    return null;
  }

  function sideView(applicationId: string | null, externalTeamId?: string | null) {
    const id = matchTeamId(applicationId, externalTeamId);
    const label = teamLabel(teamLabels, id);
    const mark = id ? teamMarks?.[id] : undefined;
    return {
      label,
      logoUrl: mark?.logoUrl ?? null,
      clubName: mark?.clubName ?? null,
    };
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

      <ul className="mt-4 grid grid-cols-1 gap-2">
        {matches.map((match) => {
          const home = sideView(match.homeApplicationId, match.homeExternalTeamId);
          const away = sideView(match.awayApplicationId, match.awayExternalTeamId);
          const completed =
            match.status === "completed" &&
            match.homeScore != null &&
            match.awayScore != null;
          const scoreNote =
            completed &&
            match.decidedBy === "penalties" &&
            match.homePenalties != null &&
            match.awayPenalties != null
              ? `n.E. ${match.homePenalties}:${match.awayPenalties}`
              : null;

          return (
            <li
              key={match.id}
              className="min-w-0 rounded-[10px] border border-line bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(16,20,28,0.04)] sm:px-3.5"
            >
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                <span className="font-display text-[13px] font-bold tracking-wide text-ink sm:text-[14px]">
                  {formatBerlinClock(match.scheduledAt)}
                </span>
                <span className="mx-1.5 text-line" aria-hidden>
                  ·
                </span>
                <span>
                  {phaseOrGroupLabel(match)} · {fieldLabel(match.fieldId)}
                </span>
              </p>

              <div className="mt-2">
                <MatchSidesScoreBlock
                  home={home}
                  away={away}
                  completed={completed}
                  homeScore={match.homeScore}
                  awayScore={match.awayScore}
                  scoreNote={scoreNote}
                  logoSize="xs"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
