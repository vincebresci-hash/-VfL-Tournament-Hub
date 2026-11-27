import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftSchedulePdfPage } from "@/components/admin/DraftSchedulePdfPage";
import { PrintScheduleButton } from "@/components/admin/PrintScheduleButton";
import {
  SchedulePdfDocument,
  type PdfMatchRow,
  type PdfStandingRow,
} from "@/components/admin/SchedulePdfDocument";
import {
  getAdminTournamentById,
  getAdminTournamentBySlug,
} from "@/lib/db/admin-queries";
import { readStoredLeagueScheduleConfig } from "@/lib/db/league-config-read";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import { matchSideParticipantId, scheduleParticipantId, teamLabelsFromParticipants } from "@/lib/schedule/admin";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import {
  buildChampionsLeagueBracketRows,
  buildClassicBracketRows,
  completePdfKnockoutRows,
  sortPdfKnockoutSchedule,
} from "@/lib/schedule/draft-schedule-pdf";
import { isGroupStageComplete, knockoutRoundLabel } from "@/lib/schedule/knockout";
import { expectedLeagueMatchCount } from "@/lib/schedule/league-phase";
import {
  assignGameNumbers,
  groupMatchesByTimeslot,
  pdfLayoutShowsStandings,
  resolvePdfLayout,
  type PdfTimelineRow,
} from "@/lib/schedule/pdf-layout";
import { computeGroupStandings, formatGoals } from "@/lib/schedule/standings";
import type { TournamentMatchRecord } from "@/types/schedule";

type PdfPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ quelle?: string; entwurf?: string }>;
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
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function modeLabel(input: {
  format: string | null;
  groupCount: number;
  layout: ReturnType<typeof resolvePdfLayout>;
  playFormat: string | null;
  hasKnockout: boolean;
}) {
  if (input.layout === "bambini") {
    return input.playFormat?.trim() || "Kinderfestival ohne Ergebniswertung";
  }
  if (input.format === "champions-league") return "Champions League";
  if (input.format === "round-robin") return "Jeder gegen jeden";
  if (input.format === "groups-knockout" || input.hasKnockout) return "Gruppenphase + K.-o.-Runde";
  if (input.groupCount > 0) return "Gruppenphase";
  return "Jeder gegen jeden";
}

function resultLabel(match: Pick<TournamentMatchRecord, "homeScore" | "awayScore">) {
  if (match.homeScore == null || match.awayScore == null) return "—";
  return `${match.homeScore}:${match.awayScore}`;
}

export default async function SchedulePdfPage({ params, searchParams }: PdfPageProps) {
  const { id } = await params;
  const { quelle, entwurf } = await searchParams;
  const draft = quelle === "entwurf";
  const tournament = await loadTournament(id);
  if (!tournament) {
    notFound();
  }

  if (draft) {
    return (
      <main style={{ background: "white", minHeight: "100vh" }}>
        {entwurf ? (
          <DraftSchedulePdfPage tournamentId={tournament.id} storageKey={entwurf} />
        ) : (
          <p role="alert" style={{ margin: "32px auto", maxWidth: "720px", padding: "20px", color: "#9a2b2b" }}>
            Für ein echtes Entwurfs-PDF muss der Export direkt aus der geöffneten Spielplanvorschau gestartet werden.
          </p>
        )}
      </main>
    );
  }

  const [stage, participants, leagueConfig] = await Promise.all([
    getAdminTournamentStage(tournament.id),
    getTournamentParticipants(tournament.id),
    readStoredLeagueScheduleConfig(tournament.id),
  ]);

  const teamLabels = teamLabelsFromParticipants(participants);
  const teamName = (participantId: string | null) =>
    participantId ? (teamLabels[participantId] ?? "Team") : "offen";
  const fields = [...stage.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const fieldName = (fieldId: string | null) =>
    fieldId ? (fields.find((field) => field.id === fieldId)?.name ?? "Feld") : "—";

  const format = leagueConfig.status === "ok" ? leagueConfig.competitionFormat : null;
  const effectiveFormat = format ?? (stage.groups.length > 0 ? "groups-knockout" : "round-robin");
  const cutoff = leagueConfig.status === "ok" ? leagueConfig.knockoutCutoff : null;
  const matchesPerTeam = leagueConfig.status === "ok" ? leagueConfig.leagueMatchesPerTeam : null;
  const layout = resolvePdfLayout({
    competitionFormat: format,
    groupCount: stage.groups.length,
    fieldCount: fields.length,
    ageGroup: tournament.ageGroup,
    playFormat: tournament.playFormat,
  });
  const isChampionsLeague = layout === "cl-single" || layout === "cl-multi";

  const leagueMatches = stage.matches.filter((match) => match.phase !== "knockout");
  const knockoutMatches = stage.matches
    .filter((match) => match.phase === "knockout")
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const numbers = assignGameNumbers(
    leagueMatches.map((match) => ({
      key: match.id,
      scheduledAt: match.scheduledAt,
      fieldId: match.fieldId,
      sortOrder: match.sortOrder,
    })),
  );
  const toRow = (match: TournamentMatchRecord): PdfMatchRow => ({
    key: match.id,
    number: numbers.get(match.id) ?? 0,
    time: match.scheduledAt ? formatBerlinClock(match.scheduledAt) : "—",
    fieldName: fieldName(match.fieldId),
    homeName: teamName(matchSideParticipantId(match, "home")),
    awayName: teamName(matchSideParticipantId(match, "away")),
    result: resultLabel(match),
  });

  const singleColumnMatches = leagueMatches
    .slice()
    .sort(
      (a, b) =>
        (a.scheduledAt ?? "~").localeCompare(b.scheduledAt ?? "~") || a.sortOrder - b.sortOrder,
    )
    .map(toRow);

  let timelineRows: Array<PdfTimelineRow<PdfMatchRow>> | null = null;
  if (layout === "cl-multi") {
    const rowByKey = new Map(singleColumnMatches.map((row) => [row.key, row]));
    timelineRows = groupMatchesByTimeslot(
      leagueMatches.map((match) => ({
        key: match.id,
        scheduledAt: match.scheduledAt,
        fieldId: match.fieldId,
        sortOrder: match.sortOrder,
      })),
      fields.map((field) => field.id),
    ).map((row) => ({
      scheduledAt: row.scheduledAt,
      cells: row.cells.map((cell) => ({
        fieldId: cell.fieldId,
        match: cell.match ? (rowByKey.get(cell.match.key) ?? null) : null,
      })),
    }));
  }

  const standings: Array<{ title: string; rows: PdfStandingRow[] }> = [];
  const qualifiedNameBySeed = new Map<string, string>();
  const leagueGroupId = stage.groups[0]?.id;
  const leagueMemberCount = leagueGroupId
    ? (stage.memberIdsByGroupId[leagueGroupId] ?? []).length
    : 0;
  const expectedLeagueMatches =
    isChampionsLeague && matchesPerTeam != null
      ? expectedLeagueMatchCount(leagueMemberCount, matchesPerTeam)
      : null;
  const preliminaryComplete = isChampionsLeague
    ? expectedLeagueMatches != null &&
      leagueMatches.length === expectedLeagueMatches &&
      leagueMatches.every(
        (match) => match.status === "completed" && match.homeScore != null && match.awayScore != null,
      )
    : isGroupStageComplete(stage.groups, stage.memberIdsByGroupId, leagueMatches).complete &&
      leagueMatches.every(
        (match) => match.status === "completed" && match.homeScore != null && match.awayScore != null,
      );
  if (pdfLayoutShowsStandings(layout)) {
    const toStandingRows = (
      memberIds: string[],
      matches: TournamentMatchRecord[],
      groupIndex: number,
    ): PdfStandingRow[] =>
      computeGroupStandings(memberIds, matches).map((row) => {
        if (preliminaryComplete) {
          const seed = isChampionsLeague || stage.groups.length === 1
            ? `Platz ${row.rank}`
            : `Platz ${row.rank} Gruppe ${String.fromCharCode(65 + groupIndex)}`;
          qualifiedNameBySeed.set(seed, teamName(row.applicationId));
        }
        return {
        rank: row.rank,
        teamName: teamName(row.applicationId),
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goals: formatGoals(row.goalsFor, row.goalsAgainst),
        goalDiff: row.goalDiff,
        points: row.points,
        qualified: isChampionsLeague && cutoff != null && row.rank <= cutoff,
        };
      });
    if (isChampionsLeague) {
      const leagueGroup = stage.groups[0];
      if (leagueGroup) {
        standings.push({
          title: "Ligatabelle",
          rows: toStandingRows(
            stage.memberIdsByGroupId[leagueGroup.id] ?? [],
            leagueMatches.filter((match) => match.groupId === leagueGroup.id),
            0,
          ),
        });
      }
    } else {
      for (const [groupIndex, group] of stage.groups.entries()) {
        standings.push({
          title: group.name,
          rows: toStandingRows(
            stage.memberIdsByGroupId[group.id] ?? [],
            leagueMatches.filter((match) => match.groupId === group.id),
            groupIndex,
          ),
        });
      }
    }
  }

  const placeholderTemplate = isChampionsLeague
    ? buildChampionsLeagueBracketRows(cutoff)
    : effectiveFormat === "groups-knockout"
      ? buildClassicBracketRows(stage.groups.length)
      : [];
  const bracketTemplate = placeholderTemplate
    .filter(
      (row) =>
        row.round !== "third-place" ||
        knockoutMatches.length === 0 ||
        knockoutMatches.some((match) => match.round === "third-place"),
    )
    .map((row) => ({
      ...row,
      homeName: qualifiedNameBySeed.get(row.homeName) ?? row.homeName,
      awayName: qualifiedNameBySeed.get(row.awayName) ?? row.awayName,
    }));
  const templateIndexByRound = new Map<string, number>();
  const persistedKnockout: PdfMatchRow[] = knockoutMatches.map((match) => {
    const round = match.round;
    const roundIndex = round ? (templateIndexByRound.get(round) ?? 0) : 0;
    if (round) templateIndexByRound.set(round, roundIndex + 1);
    const placeholder = round
      ? bracketTemplate.filter((row) => row.round === round)[roundIndex]
      : null;
    const row = toRow(match);
    return {
      ...row,
      homeName: matchSideParticipantId(match, "home") ? row.homeName : (placeholder?.homeName ?? "Offen"),
      awayName: matchSideParticipantId(match, "away") ? row.awayName : (placeholder?.awayName ?? "Offen"),
      round,
      nextKey: match.nextMatchId,
      roundLabel: round ? knockoutRoundLabel[round] : "K.-o.-Spiel",
      isFinal: round === "final",
    };
  });
  const knockout = completePdfKnockoutRows(
    bracketTemplate,
    persistedKnockout,
    singleColumnMatches.length + 1,
  );

  const participantNames = participants
    .map((participant) => {
      const key = scheduleParticipantId(participant);
      return key ? (teamLabels[key] ?? "Team") : null;
    })
    .filter((name): name is string => Boolean(name));
  const participantGroups = isChampionsLeague
    ? null
    : stage.groups.map((group) => ({
        title: group.name,
        names: (stage.memberIdsByGroupId[group.id] ?? []).map((participantId) => teamName(participantId)),
      }));

  const fieldCount = fields.length;
  const metaParts = [
    `${tournament.matchDurationMinutes} Min Spielzeit`,
    `${tournament.breakMinutes} Min Wechselzeit`,
    `${fieldCount} ${fieldCount === 1 ? "Feld" : "Felder"}`,
  ];
  if (isChampionsLeague) {
    if (matchesPerTeam != null) metaParts.push(`${matchesPerTeam} Spiele/Team`);
    if (cutoff != null) metaParts.push(`Top ${cutoff}`);
  }

  return (
    <main style={{ background: "white" }}>
      <div className="print:hidden" style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
        <Link href={`/admin/turniere/${tournament.id}/spielplan`} style={{ fontSize: "13px", color: "#6b7280" }}>
          ← Zurück zum Spielplan
        </Link>
        <PrintScheduleButton />
      </div>
      <div className="pdf-preview-shell" style={{ maxWidth: "1120px", margin: "0 auto", padding: "18px" }}>
        {!stage.ready ? (
          <p>Die Datenbank ist noch nicht eingerichtet.</p>
        ) : (
          <SchedulePdfDocument
            layout={layout}
            draft={false}
            tournamentName={tournament.name}
            dateLabel={formatTournamentDate(tournament.date)}
            startTimeLabel={tournament.startTime ?? null}
            location={tournament.location}
            description={tournament.description}
            modeLabel={modeLabel({
              format,
              groupCount: stage.groups.length,
              layout,
              playFormat: tournament.playFormat,
              hasKnockout: knockout.length > 0,
            })}
            metaLine={metaParts.join(" · ")}
            participants={participantNames}
            participantGroups={participantGroups}
            scheduleTitle={isChampionsLeague ? "Ligaphase – Spielplan" : "Spielplan"}
            singleColumnMatches={singleColumnMatches}
            timelineRows={timelineRows}
            fieldNames={fields.map((field) => field.name)}
            standings={standings}
            showStandings={pdfLayoutShowsStandings(layout)}
            standingsFinalized={preliminaryComplete}
            knockoutTitle={isChampionsLeague ? "K.-o.-Runde (Endrunde)" : "K.-o.-Runde"}
            knockoutSchedule={sortPdfKnockoutSchedule(knockout)}
            knockout={knockout}
          />
        )}
      </div>
    </main>
  );
}
