import { ParticipantClubLogo } from "@/components/tournaments/ParticipantClubLogo";
import { formatGoals } from "@/lib/schedule/standings";
import type { StandingRow } from "@/types/schedule";

export type TournamentStandingsGroup = {
  id: string;
  name: string;
  standings: StandingRow[];
};

export type TournamentStandingsMark = {
  logoUrl: string | null;
  clubName: string;
};

type TournamentStandingsSectionProps = {
  groups: TournamentStandingsGroup[];
  teamLabels: Record<string, string>;
  teamMarks?: Record<string, TournamentStandingsMark>;
};

/**
 * V2-C3 presentational Hub Tabelle.
 * Receives already-calculated standings in caller order.
 * No queries, sorting, ranking, or source selection.
 */
export function TournamentStandingsSection({
  groups,
  teamLabels,
  teamMarks,
}: TournamentStandingsSectionProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
          Tabelle
        </h2>
        <p className="text-[13px] font-medium tracking-wide text-muted">
          {groups.length} {groups.length === 1 ? "Gruppe" : "Gruppen"}
        </p>
      </div>

      <div className="mt-4 grid gap-3.5">
        {groups.map((group) => {
          const headingId = `tabelle-gruppe-${group.id}`;
          const teamCount = group.standings.length;

          return (
            <article
              key={group.id}
              className="min-w-0 rounded-[10px] border border-line bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(16,20,28,0.04)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line/80 pb-2.5">
                <h3
                  id={headingId}
                  className="font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-base"
                >
                  {group.name}
                </h3>
                <p className="text-[12px] font-medium tracking-wide text-muted">
                  {teamCount} {teamCount === 1 ? "Team" : "Teams"}
                </p>
              </div>

              <div className="mt-3 max-w-full overflow-x-auto">
                <table
                  aria-labelledby={headingId}
                  className="w-full min-w-[40rem] border-collapse text-left text-[13px] text-ink"
                >
                  <caption className="sr-only">{group.name}</caption>
                  <thead>
                    <tr className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                      <th scope="col" className="pb-2 pr-3 font-semibold">Pl</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">Team</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">Sp</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">S</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">U</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">N</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">Tore</th>
                      <th scope="col" className="pb-2 pr-3 font-semibold">Diff</th>
                      <th scope="col" className="border-b-2 border-brand-yellow pb-2 font-semibold">Pkt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.standings.map((row) => {
                      const mark = teamMarks?.[row.applicationId];
                      const label = teamLabels[row.applicationId] ?? "Team";

                      return (
                        <tr key={row.applicationId} className="border-t border-line">
                          <td className="py-2 pr-3 font-semibold tabular-nums">
                            {row.rank}
                          </td>
                          <td className="max-w-[14rem] py-2 pr-3 sm:max-w-[22rem]">
                            <span className="flex min-w-0 items-center gap-2">
                              {mark ? (
                                <ParticipantClubLogo
                                  logoUrl={mark.logoUrl}
                                  clubName={mark.clubName}
                                  size="sm"
                                />
                              ) : null}
                              <span className="min-w-0 leading-snug font-medium break-words">
                                {label}
                              </span>
                            </span>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{row.played}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.won}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.drawn}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.lost}</td>
                          <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                            {formatGoals(row.goalsFor, row.goalsAgainst)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                          </td>
                          <td className="py-2 font-bold tabular-nums">{row.points}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
