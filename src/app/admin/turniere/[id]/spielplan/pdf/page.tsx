import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintScheduleButton } from "@/components/admin/PrintScheduleButton";
import { TournamentAdminChrome } from "@/components/admin/TournamentAdminChrome";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { readStoredLeagueScheduleConfig } from "@/lib/db/league-config-read";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { getAdminLifecyclePanelModel } from "@/lib/db/tournament-lifecycle-admin";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import { formatBerlinClock, isoToBerlinParts } from "@/lib/schedule/datetime";
import { knockoutRoundLabel } from "@/lib/schedule/knockout";
import { matchSideParticipantId, teamLabelsFromParticipants } from "@/lib/schedule/admin";
import { computeGroupStandings, formatGoals } from "@/lib/schedule/standings";
import type { TournamentMatchRecord } from "@/types/schedule";

type PdfPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

async function loadTournament(idOrSlug: string) {
  return (await getAdminTournamentById(idOrSlug)) ?? (await getAdminTournamentBySlug(idOrSlug));
}

export async function generateMetadata({ params }: PdfPageProps): Promise<Metadata> {
  const { id } = await params;
  const tournament = await loadTournament(id);
  return { title: tournament ? `Spielplan als PDF · ${tournament.name}` : "Spielplan als PDF" };
}

function formatTournamentDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}.${month}.${year}`;
}

function modeLabel(format: string | null, groupCount: number) {
  if (format === "champions-league") {
    return "Champions League";
  }
  if (format === "round-robin") {
    return "Jeder gegen jeden";
  }
  if (format === "groups-knockout" || groupCount > 0) {
    return "Gruppenphase + K.-o.-Runde";
  }
  return "Jeder gegen jeden";
}

function resultLabel(match: TournamentMatchRecord) {
  if (match.homeScore == null || match.awayScore == null) {
    return "—";
  }
  return `${match.homeScore}:${match.awayScore}`;
}

function kickoffLabel(iso: string | null) {
  if (!iso) {
    return "—";
  }
  const parts = isoToBerlinParts(iso);
  return `${parts.date.split("-").reverse().join(".")} ${formatBerlinClock(iso)}`;
}

export default async function SchedulePdfPage({ params }: PdfPageProps) {
  const { id } = await params;
  const tournament = await loadTournament(id);
  if (!tournament) {
    notFound();
  }

  const [stage, participants, lifecycle, leagueConfig] = await Promise.all([
    getAdminTournamentStage(tournament.id),
    getTournamentParticipants(tournament.id),
    getAdminLifecyclePanelModel(tournament.id),
    readStoredLeagueScheduleConfig(tournament.id),
  ]);
  const teamLabels = teamLabelsFromParticipants(participants);
  const fieldNames = Object.fromEntries(stage.fields.map((field) => [field.id, field.name]));
  const format = leagueConfig.status === "ok" ? leagueConfig.competitionFormat : null;
  const leagueMatches = stage.matches
    .filter((match) => match.phase !== "knockout")
    .slice()
    .sort((left, right) => (left.scheduledAt ?? "").localeCompare(right.scheduledAt ?? "") || left.sortOrder - right.sortOrder);
  const knockoutMatches = stage.matches
    .filter((match) => match.phase === "knockout")
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return (
    <TournamentAdminChrome tournament={tournament} lifecycle={lifecycle.model} current="schedule">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          nav, header, button, a { display: none !important; }
          body { background: white; }
        }
        .pdf-sheet h1, .pdf-sheet h2 { break-after: avoid; }
        .pdf-sheet tr, .pdf-sheet li { break-inside: avoid; }
        .pdf-break { break-before: page; }
      `}</style>
      <article className="pdf-sheet grid gap-6 bg-white text-ink">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`/admin/turniere/${tournament.id}/spielplan`} className="text-[13px] text-muted">
            Zurück zum Spielplan
          </Link>
          <PrintScheduleButton />
        </div>
        <header className="grid gap-1">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">Spielplan</p>
          <h1 className="text-[28px] font-semibold">{tournament.name}</h1>
          <p>{formatTournamentDate(tournament.date)}</p>
          <p>{modeLabel(format, stage.groups.length)}</p>
          {format === "champions-league" && leagueConfig.status === "ok" ? (
            <p className="text-[14px] text-muted">
              {leagueConfig.leagueMatchesPerTeam ?? "—"} Spiele pro Team
              {leagueConfig.knockoutCutoff ? ` · Top ${leagueConfig.knockoutCutoff}` : ""}
            </p>
          ) : null}
        </header>

        {!stage.ready ? (
          <p>Die Datenbank ist noch nicht eingerichtet.</p>
        ) : (
          <>
            <section>
              <h2 className="text-[18px] font-semibold">
                {format === "champions-league" ? "Ligaphase" : "Spielplan"}
              </h2>
              {leagueMatches.length === 0 ? (
                <p className="mt-2 text-[14px]">Noch keine Begegnungen.</p>
              ) : (
                <table className="mt-3 w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="py-1 pr-2">Zeit</th>
                      <th className="py-1 pr-2">Feld</th>
                      <th className="py-1 pr-2">Heim</th>
                      <th className="py-1 pr-2">Gast</th>
                      <th className="py-1">Ergebnis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueMatches.map((match) => {
                      const homeId = matchSideParticipantId(match, "home");
                      const awayId = matchSideParticipantId(match, "away");
                      return (
                        <tr key={match.id} className="border-b border-neutral-300">
                          <td className="py-1 pr-2">{kickoffLabel(match.scheduledAt)}</td>
                          <td className="py-1 pr-2">{match.fieldId ? (fieldNames[match.fieldId] ?? "Feld") : "—"}</td>
                          <td className="py-1 pr-2">{homeId ? (teamLabels[homeId] ?? "Team") : "—"}</td>
                          <td className="py-1 pr-2">{awayId ? (teamLabels[awayId] ?? "Team") : "—"}</td>
                          <td className="py-1">{resultLabel(match)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            <section className="pdf-break">
              <h2 className="text-[18px] font-semibold">Tabelle</h2>
              {stage.groups.length === 0 ? (
                <p className="mt-2 text-[14px]">Noch keine Tabelle.</p>
              ) : (
                stage.groups.map((group) => {
                  const standings = computeGroupStandings(
                    stage.memberIdsByGroupId[group.id] ?? [],
                    leagueMatches.filter((match) => match.groupId === group.id),
                  );
                  return (
                    <div key={group.id} className="mt-4">
                      <h3 className="text-[14px] font-semibold">{group.name}</h3>
                      <table className="mt-2 w-full border-collapse text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-black">
                            <th className="py-1 pr-2">Pl</th>
                            <th className="py-1 pr-2">Team</th>
                            <th className="py-1 pr-2">Sp</th>
                            <th className="py-1 pr-2">S</th>
                            <th className="py-1 pr-2">U</th>
                            <th className="py-1 pr-2">N</th>
                            <th className="py-1 pr-2">Tore</th>
                            <th className="py-1 pr-2">Diff</th>
                            <th className="py-1">Pkt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {standings.map((row) => (
                            <tr key={row.applicationId} className="border-b border-neutral-300">
                              <td className="py-1 pr-2">{row.rank}</td>
                              <td className="py-1 pr-2">{teamLabels[row.applicationId] ?? "Team"}</td>
                              <td className="py-1 pr-2">{row.played}</td>
                              <td className="py-1 pr-2">{row.won}</td>
                              <td className="py-1 pr-2">{row.drawn}</td>
                              <td className="py-1 pr-2">{row.lost}</td>
                              <td className="py-1 pr-2">{formatGoals(row.goalsFor, row.goalsAgainst)}</td>
                              <td className="py-1 pr-2">{row.goalDiff}</td>
                              <td className="py-1">{row.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })
              )}
            </section>

            {knockoutMatches.length > 0 ? (
              <section className="pdf-break">
                <h2 className="text-[18px] font-semibold">K.-o.-Runde</h2>
                <ul className="mt-3 grid gap-2 text-[12px]">
                  {knockoutMatches.map((match) => {
                    const homeId = matchSideParticipantId(match, "home");
                    const awayId = matchSideParticipantId(match, "away");
                    return (
                      <li key={match.id}>
                        {match.round ? knockoutRoundLabel[match.round] : "K.-o.-Spiel"}
                        {" · "}
                        {kickoffLabel(match.scheduledAt)}
                        {" · "}
                        {match.fieldId ? (fieldNames[match.fieldId] ?? "Feld") : "—"}
                        {" · "}
                        {homeId ? (teamLabels[homeId] ?? "Team") : "offen"}
                        {" vs "}
                        {awayId ? (teamLabels[awayId] ?? "Team") : "offen"}
                        {" · "}
                        {resultLabel(match)}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </article>
    </TournamentAdminChrome>
  );
}
