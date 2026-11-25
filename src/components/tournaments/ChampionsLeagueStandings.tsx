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

function diffLabel(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

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
    <section aria-labelledby="league-table-heading" className="min-w-0 max-w-full pb-20 sm:pb-24 lg:pb-0">
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
                Eine Tabelle für alle Teams. Qualifikationsplätze sind markiert.
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
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-brand-blue" aria-hidden="true" />
              {qualificationLabel}
            </span>
            <span>{complete ? "Ligaphase abgeschlossen" : "Tabelle vorläufig"}</span>
          </div>
        </div>

        {standings.length === 0 ? (
          <p className="px-4 py-8 text-[15px] text-muted sm:px-6">
            Die Ligatabelle ist noch nicht verfügbar.
          </p>
        ) : (
          <>
            <div className="lg:hidden">
              <table className="w-full table-fixed border-collapse text-left text-[12px] text-ink sm:text-[13px]">
                <caption className="sr-only">
                  Kompakte Champions-League-Ligatabelle mit Platz, Mannschaft, Spielen,
                  Tordifferenz und Punkten
                </caption>
                <colgroup>
                  <col className="w-10 sm:w-12" />
                  <col />
                  <col className="w-9 sm:w-11" />
                  <col className="w-11 sm:w-14" />
                  <col className="w-10 sm:w-12" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line text-[9px] font-semibold tracking-[0.08em] text-muted uppercase sm:text-[10px]">
                    <th scope="col" className="py-2.5 pl-2 pr-1 sm:pl-4">Pl</th>
                    <th scope="col" className="py-2.5 pr-1">Mannschaft</th>
                    <th scope="col" className="px-1 py-2.5 text-center">Sp</th>
                    <th scope="col" className="px-1 py-2.5 text-center">Diff</th>
                    <th scope="col" className="py-2.5 pl-1 pr-2 text-center sm:pr-4">Pkt</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => {
                    const qualified = championsLeagueQualificationBand(row.rank, knockoutCutoff) === "knockout";
                    const mark = teamMarks[row.applicationId];
                    const boundary = row.rank === knockoutCutoff;
                    return (
                      <tr
                        key={row.applicationId}
                        className={`${qualified ? "bg-[#f2f7ff]" : "bg-white"} ${boundary ? "border-b-[3px] border-brand-blue" : "border-b border-line"}`}
                      >
                        <td className="py-2.5 pl-2 pr-1 font-bold tabular-nums sm:pl-4">
                          <span className="inline-flex items-center gap-1">
                            <span className={qualified ? "h-5 w-0.5 rounded-full bg-brand-blue" : "h-5 w-0.5 rounded-full bg-line"} aria-hidden="true" />
                            {row.rank}
                          </span>
                        </td>
                        <th scope="row" className="min-w-0 py-2.5 pr-1">
                          <TeamNameWithLogo
                            label={teamLabels[row.applicationId] ?? "Team"}
                            logoUrl={mark?.logoUrl}
                            clubName={mark?.clubName}
                            size="xs"
                            logoFallback="initial"
                            className="min-w-0"
                            nameClassName="truncate text-[11px] sm:text-[13px]"
                          />
                        </th>
                        <td className="px-1 py-2.5 text-center tabular-nums">{row.played}</td>
                        <td className="px-1 py-2.5 text-center tabular-nums">{diffLabel(row.goalDiff)}</td>
                        <td className="py-2.5 pl-1 pr-2 text-center font-bold tabular-nums sm:pr-4">{row.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <details className="border-t border-line bg-surface/45 px-3 py-3 sm:px-4">
                <summary className="cursor-pointer text-[11px] font-semibold tracking-[0.08em] text-ink uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow">
                  Weitere Statistiken anzeigen
                </summary>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {standings.map((row) => (
                    <li key={row.applicationId} className="rounded-md border border-line bg-white px-3 py-2.5">
                      <p className="truncate text-[12px] font-semibold text-ink">
                        {row.rank}. {teamLabels[row.applicationId] ?? "Team"}
                      </p>
                      <dl className="mt-2 grid grid-cols-5 gap-1 text-center">
                        {[
                          ["S", row.won],
                          ["U", row.drawn],
                          ["N", row.lost],
                          ["T", row.goalsFor],
                          ["GT", row.goalsAgainst],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-[9px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
                            <dd className="mt-0.5 text-[12px] font-semibold tabular-nums text-ink">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              </details>
            </div>

            <div className="hidden lg:block">
              <table className="w-full border-collapse text-left text-[14px] text-ink">
                <caption className="sr-only">
                  Gemeinsame Champions-League-Ligatabelle mit Qualifikationsplätzen
                </caption>
                <thead>
                  <tr className="border-b border-line text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
                    <th scope="col" className="w-14 py-3 pl-6 pr-2">Pl</th>
                    <th scope="col" className="min-w-52 py-3 pr-4">Mannschaft</th>
                    <th scope="col" className="px-2 py-3 text-center">Sp</th>
                    <th scope="col" className="px-2 py-3 text-center">S</th>
                    <th scope="col" className="px-2 py-3 text-center">U</th>
                    <th scope="col" className="px-2 py-3 text-center">N</th>
                    <th scope="col" className="px-2 py-3 text-center">T</th>
                    <th scope="col" className="px-2 py-3 text-center">GT</th>
                    <th scope="col" className="px-2 py-3 text-center">Diff</th>
                    <th scope="col" className="border-b-2 border-brand-yellow px-4 py-3 text-center pr-6">Pkt</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => {
                    const qualified = championsLeagueQualificationBand(row.rank, knockoutCutoff) === "knockout";
                    const mark = teamMarks[row.applicationId];
                    const boundary = row.rank === knockoutCutoff;
                    return (
                      <tr
                        key={row.applicationId}
                        className={`${qualified ? "bg-[#f2f7ff]" : "bg-white"} ${boundary ? "border-b-[3px] border-brand-blue" : "border-b border-line"}`}
                      >
                        <td className="py-3 pl-6 pr-2 font-bold tabular-nums">
                          <span className="inline-flex items-center gap-2">
                            <span className={qualified ? "h-5 w-1 rounded-full bg-brand-blue" : "h-5 w-1 rounded-full bg-line"} aria-hidden="true" />
                            {row.rank}
                          </span>
                        </td>
                        <th scope="row" className="max-w-64 py-3 pr-4">
                          <TeamNameWithLogo
                            label={teamLabels[row.applicationId] ?? "Team"}
                            logoUrl={mark?.logoUrl}
                            clubName={mark?.clubName}
                            size="xs"
                            logoFallback="initial"
                            nameClassName="text-[14px]"
                          />
                        </th>
                        <td className="px-2 py-3 text-center tabular-nums">{row.played}</td>
                        <td className="px-2 py-3 text-center tabular-nums">{row.won}</td>
                        <td className="px-2 py-3 text-center tabular-nums">{row.drawn}</td>
                        <td className="px-2 py-3 text-center tabular-nums">{row.lost}</td>
                        <td className="px-2 py-3 text-center tabular-nums">{row.goalsFor}</td>
                        <td className="px-2 py-3 text-center tabular-nums">{row.goalsAgainst}</td>
                        <td className="px-2 py-3 text-center tabular-nums">{diffLabel(row.goalDiff)}</td>
                        <td className="px-4 py-3 pr-6 text-center font-bold tabular-nums">{row.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
