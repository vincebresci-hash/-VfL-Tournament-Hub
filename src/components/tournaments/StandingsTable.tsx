import { computeGroupStandings, formatGoals } from "@/lib/schedule/standings";

type StandingsTableProps = {
  standings: ReturnType<typeof computeGroupStandings>;
  teamLabels: Record<string, string>;
};

export function StandingsTable({ standings, teamLabels }: StandingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px] text-ink">
        <thead>
          <tr className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
            <th className="pb-2 pr-3">Pl</th>
            <th className="pb-2 pr-3">Team</th>
            <th className="pb-2 pr-3">Sp</th>
            <th className="pb-2 pr-3">S</th>
            <th className="pb-2 pr-3">U</th>
            <th className="pb-2 pr-3">N</th>
            <th className="pb-2 pr-3">Tore</th>
            <th className="pb-2 pr-3">Diff</th>
            <th className="pb-2">Pkt</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => (
            <tr key={row.applicationId} className="border-t border-line">
              <td className="py-2 pr-3">{row.rank}</td>
              <td className="py-2 pr-3">{teamLabels[row.applicationId] ?? "Team"}</td>
              <td className="py-2 pr-3">{row.played}</td>
              <td className="py-2 pr-3">{row.won}</td>
              <td className="py-2 pr-3">{row.drawn}</td>
              <td className="py-2 pr-3">{row.lost}</td>
              <td className="py-2 pr-3">{formatGoals(row.goalsFor, row.goalsAgainst)}</td>
              <td className="py-2 pr-3">{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
              <td className="py-2 font-semibold">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
