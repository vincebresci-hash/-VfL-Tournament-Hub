import { TeamNameWithLogo } from "@/components/tournaments/TeamNameWithLogo";
import {
  championsLeagueQualificationBand,
  championsLeagueQualificationLabel,
} from "@/lib/tournaments/champions-league-public";
import type { StandingRow } from "@/types/schedule";

type TeamMark = {
  logoUrl: string | null;
  clubName: string;
};

type ChampionsLeagueStandingsProps = {
  standings: StandingRow[];
  teamLabels: Record<string, string>;
  teamMarks: Record<string, TeamMark>;
  knockoutCutoff: 4 | 8;
  matchesPerTeam: number | null;
  complete: boolean;
};

export function ChampionsLeagueStandings({
  standings,
  teamLabels,
  teamMarks,
  knockoutCutoff,
  matchesPerTeam,
  complete,
}: ChampionsLeagueStandingsProps) {
  const qualificationLabel = championsLeagueQualificationLabel({
    complete,
    knockoutCutoff,
  });

  return (
    <section aria-labelledby="league-table-heading" className="min-w-0 max-w-full">
      <div className="overflow-hidden rounded-[12px] border border-navy/15 bg-white shadow-[0_10px_30px_rgba(7,11,18,0.08)]">
        <header className="relative overflow-hidden bg-navy px-4 py-5 text-white sm:px-6 sm:py-6">
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,rgba(255,204,0,0.2),transparent_68%)]"
          />
          <div className="relative flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-yellow uppercase">
                Champions League
              </p>
              <h2
                id="league-table-heading"
                className="mt-1 font-display text-2xl font-bold tracking-wide uppercase sm:text-3xl"
              >
                Ligatabelle
              </h2>
              <p className="mt-2 max-w-xl text-[13px] leading-5 text-white/70 sm:text-[14px]">
                Alle Mannschaften in einer gemeinsamen Ligaphase. Die Tabelle wird nur aus
                veröffentlichten Ergebnissen des Tournament Hubs berechnet.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-right sm:shrink-0">
              <span className="rounded-md border border-white/15 bg-white/8 px-3 py-2">
                <span className="block text-[10px] tracking-[0.1em] text-white/60 uppercase">Teams</span>
                <span className="font-display text-xl font-bold tabular-nums">{standings.length}</span>
              </span>
              <span className="rounded-md border border-white/15 bg-white/8 px-3 py-2">
                <span className="block text-[10px] tracking-[0.1em] text-white/60 uppercase">Spiele/Team</span>
                <span className="font-display text-xl font-bold tabular-nums">{matchesPerTeam ?? "–"}</span>
              </span>
            </div>
          </div>
        </header>

        <div className="border-b border-line bg-surface/70 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-medium text-muted">
            <span className="inline-flex shrink-0 items-center gap-2">
              <span className="h-3 w-1 rounded-full bg-brand-blue" aria-hidden="true" />
              {qualificationLabel}
            </span>
            {!complete ? <span className="shrink-0">Stand: vorläufig</span> : <span className="shrink-0">Ligaphase abgeschlossen</span>}
            <span className="w-full text-[11px] sm:hidden">Für alle Werte seitlich wischen.</span>
          </div>
        </div>

        {standings.length === 0 ? (
          <p className="px-4 py-8 text-[15px] text-muted sm:px-6">
            Die Ligatabelle ist noch nicht verfügbar.
          </p>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-left text-[13px] text-ink sm:text-[14px]">
              <caption className="sr-only">
                Gemeinsame Champions-League-Ligatabelle mit Qualifikationsplätzen
              </caption>
              <thead>
                <tr className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                  <th scope="col" className="sticky left-0 z-20 w-12 bg-white py-3 pl-4 pr-2 sm:pl-6">Pl</th>
                  <th scope="col" className="sticky left-12 z-20 min-w-52 bg-white py-3 pr-4">Mannschaft</th>
                  <th scope="col" className="px-2 py-3 text-center">Sp</th>
                  <th scope="col" className="px-2 py-3 text-center">S</th>
                  <th scope="col" className="px-2 py-3 text-center">U</th>
                  <th scope="col" className="px-2 py-3 text-center">N</th>
                  <th scope="col" className="px-2 py-3 text-center">T</th>
                  <th scope="col" className="px-2 py-3 text-center">GT</th>
                  <th scope="col" className="px-2 py-3 text-center">Diff</th>
                  <th scope="col" className="border-b-2 border-brand-yellow px-4 py-3 text-center sm:pr-6">Pkt</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => {
                  const qualified =
                    championsLeagueQualificationBand(row.rank, knockoutCutoff) === "knockout";
                  const mark = teamMarks[row.applicationId];
                  const stickyBackground = qualified ? "bg-[#f2f7ff]" : "bg-white";

                  return (
                    <tr
                      key={row.applicationId}
                      className={qualified ? "border-t border-line bg-[#f2f7ff]" : "border-t border-line bg-white"}
                    >
                      <td className={`sticky left-0 z-10 py-3 pl-4 pr-2 font-bold tabular-nums sm:pl-6 ${stickyBackground}`}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={qualified ? "h-5 w-1 rounded-full bg-brand-blue" : "h-5 w-1 rounded-full bg-line"}
                            aria-hidden="true"
                          />
                          {row.rank}
                        </span>
                      </td>
                      <th scope="row" className={`sticky left-12 z-10 max-w-64 py-3 pr-4 ${stickyBackground}`}>
                        <TeamNameWithLogo
                          label={teamLabels[row.applicationId] ?? "Team"}
                          logoUrl={mark?.logoUrl}
                          clubName={mark?.clubName}
                          size="xs"
                          nameClassName="text-[13px] sm:text-[14px]"
                        />
                      </th>
                      <td className="px-2 py-3 text-center tabular-nums">{row.played}</td>
                      <td className="px-2 py-3 text-center tabular-nums">{row.won}</td>
                      <td className="px-2 py-3 text-center tabular-nums">{row.drawn}</td>
                      <td className="px-2 py-3 text-center tabular-nums">{row.lost}</td>
                      <td className="px-2 py-3 text-center tabular-nums">{row.goalsFor}</td>
                      <td className="px-2 py-3 text-center tabular-nums">{row.goalsAgainst}</td>
                      <td className="px-2 py-3 text-center tabular-nums">
                        {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                      </td>
                      <td className="px-4 py-3 text-center font-bold tabular-nums sm:pr-6">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
