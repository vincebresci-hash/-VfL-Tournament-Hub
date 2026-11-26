import type {
  PdfMatchRow,
  PdfStandingRow,
  SchedulePdfDocumentProps,
} from "@/components/admin/SchedulePdfDocument";
import { formatBerlinClock } from "@/lib/schedule/datetime";
import type { EditablePreviewMatch } from "@/lib/schedule/league-preview-edit";
import { knockoutRoundLabel } from "@/lib/schedule/knockout";
import {
  assignGameNumbers,
  groupMatchesByTimeslot,
  pdfLayoutShowsStandings,
  resolvePdfLayout,
} from "@/lib/schedule/pdf-layout";
import {
  previewParticipantKey,
  type PlanPreviewKoMatch,
  type TournamentPlanPreview,
} from "@/lib/schedule/plan-preview";
import type { AdminTournamentRecord } from "@/types/admin";
import type { KnockoutRound } from "@/types/schedule";

export const DRAFT_PDF_STORAGE_PREFIX = "vfl:spielplan-entwurf:";

export type DraftSchedulePdfEnvelope = {
  version: 1;
  tournamentId: string;
  createdAt: string;
  document: SchedulePdfDocumentProps;
};

type DraftPdfInput = {
  tournament: AdminTournamentRecord;
  preview: TournamentPlanPreview;
  editedMatches?: readonly EditablePreviewMatch[] | null;
  teamLabels: Readonly<Record<string, string>>;
  fields: ReadonlyArray<{ id: string; name: string }>;
  matchesPerTeam: number | null;
  knockoutCutoff: 4 | 8 | 16 | null;
};

function dateLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function participantName(
  ref: { applicationId: string | null; externalTeamId: string | null },
  labels: Readonly<Record<string, string>>,
) {
  const key = previewParticipantKey(ref);
  return key ? (labels[key] ?? "Unbenannte Mannschaft") : "Offen";
}

function emptyStandingRows(names: readonly string[], cutoff: number | null): PdfStandingRow[] {
  return names.map((teamName, index) => ({
    rank: index + 1,
    teamName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goals: "0:0",
    goalDiff: 0,
    points: 0,
    qualified: cutoff != null && index < cutoff,
  }));
}

function bracketRow(
  key: string,
  round: KnockoutRound,
  homeName: string,
  awayName: string,
  index: number,
  nextKey: string | null = null,
): PdfMatchRow {
  return {
    key,
    number: index + 1,
    time: "Termin offen",
    fieldName: "Feld offen",
    homeName,
    awayName,
    result: "—",
    round,
    roundLabel: knockoutRoundLabel[round],
    nextKey,
    isFinal: round === "final",
  };
}

export function buildChampionsLeagueBracketRows(cutoff: 4 | 8 | 16 | null): PdfMatchRow[] {
  if (!cutoff) return [];
  const rows: PdfMatchRow[] = [];
  let index = 0;
  if (cutoff === 16) {
    const seeds = [[1, 16], [8, 9], [4, 13], [5, 12], [2, 15], [7, 10], [3, 14], [6, 11]];
    seeds.forEach(([home, away], matchIndex) => {
      rows.push(bracketRow(`af${matchIndex + 1}`, "round-of-16", `Platz ${home}`, `Platz ${away}`, index++, `vf${Math.floor(matchIndex / 2) + 1}`));
    });
  }
  if (cutoff >= 8) {
    const quarterfinals = cutoff === 8
      ? [["Platz 1", "Platz 8"], ["Platz 4", "Platz 5"], ["Platz 2", "Platz 7"], ["Platz 3", "Platz 6"]]
      : [["Sieger AF1", "Sieger AF2"], ["Sieger AF3", "Sieger AF4"], ["Sieger AF5", "Sieger AF6"], ["Sieger AF7", "Sieger AF8"]];
    quarterfinals.forEach(([home, away], matchIndex) => {
      rows.push(bracketRow(`vf${matchIndex + 1}`, "quarterfinal", home!, away!, index++, `hf${Math.floor(matchIndex / 2) + 1}`));
    });
  }
  const semifinals = cutoff === 4
    ? [["Platz 1", "Platz 4"], ["Platz 2", "Platz 3"]]
    : [["Sieger VF1", "Sieger VF2"], ["Sieger VF3", "Sieger VF4"]];
  semifinals.forEach(([home, away], matchIndex) => {
    rows.push(bracketRow(`hf${matchIndex + 1}`, "semifinal", home!, away!, index++, "final"));
  });
  rows.push(bracketRow("final", "final", "Sieger HF1", "Sieger HF2", index++));
  rows.push(bracketRow("third", "third-place", "Verlierer HF1", "Verlierer HF2", index++));
  return rows;
}

function seedName(seed: string | null, round: KnockoutRound, matchIndex: number, side: "home" | "away") {
  if (seed) {
    const leagueSeed = /^S(\d+)$/.exec(seed);
    if (leagueSeed) return `Platz ${leagueSeed[1]}`;
    const groupSeed = /^([A-Z])(\d+)$/.exec(seed);
    if (groupSeed) return `Platz ${groupSeed[2]} Gruppe ${groupSeed[1]}`;
    return seed;
  }
  const pair = matchIndex * 2 + (side === "home" ? 1 : 2);
  if (round === "quarterfinal") return `Sieger AF${pair}`;
  if (round === "semifinal") return `Sieger VF${pair}`;
  if (round === "final") return side === "home" ? "Sieger HF1" : "Sieger HF2";
  if (round === "third-place") return side === "home" ? "Verlierer HF1" : "Verlierer HF2";
  return "Offen";
}

function classicBracket(plan: readonly PlanPreviewKoMatch[] | null): PdfMatchRow[] {
  if (!plan) return [];
  const indexByRound = new Map<KnockoutRound, number>();
  return [...plan]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((match, index) => {
      const matchIndex = indexByRound.get(match.round) ?? 0;
      indexByRound.set(match.round, matchIndex + 1);
      return bracketRow(
        match.key,
        match.round,
        seedName(match.homeSeed, match.round, matchIndex, "home"),
        seedName(match.awaySeed, match.round, matchIndex, "away"),
        index,
        match.nextKey,
      );
    });
}

export function buildClassicBracketRows(groupCount: number): PdfMatchRow[] {
  if (groupCount !== 2 && groupCount !== 4) return [];
  const rows: PdfMatchRow[] = [];
  let index = 0;
  if (groupCount === 4) {
    [["Platz 1 Gruppe A", "Platz 2 Gruppe B"], ["Platz 1 Gruppe B", "Platz 2 Gruppe A"], ["Platz 1 Gruppe C", "Platz 2 Gruppe D"], ["Platz 1 Gruppe D", "Platz 2 Gruppe C"]]
      .forEach(([home, away], matchIndex) => rows.push(bracketRow(`vf${matchIndex + 1}`, "quarterfinal", home!, away!, index++, `hf${Math.floor(matchIndex / 2) + 1}`)));
  }
  const semifinalSeeds = groupCount === 2
    ? [["Platz 1 Gruppe A", "Platz 2 Gruppe B"], ["Platz 1 Gruppe B", "Platz 2 Gruppe A"]]
    : [["Sieger VF1", "Sieger VF2"], ["Sieger VF3", "Sieger VF4"]];
  semifinalSeeds.forEach(([home, away], matchIndex) => rows.push(bracketRow(`hf${matchIndex + 1}`, "semifinal", home!, away!, index++, "final")));
  rows.push(bracketRow("final", "final", "Sieger HF1", "Sieger HF2", index++));
  rows.push(bracketRow("third", "third-place", "Verlierer HF1", "Verlierer HF2", index++));
  return rows;
}

export function buildDraftSchedulePdfDocument(input: DraftPdfInput): SchedulePdfDocumentProps {
  const matches = input.editedMatches ?? input.preview.matches;
  const layout = resolvePdfLayout({
    competitionFormat: input.preview.mode,
    groupCount: input.preview.groups.length,
    fieldCount: input.fields.length,
    ageGroup: input.tournament.ageGroup,
    playFormat: input.tournament.playFormat,
  });
  const fieldNameById = new Map(input.fields.map((field) => [field.id, field.name]));
  const numbers = assignGameNumbers(matches);
  const rows: PdfMatchRow[] = [...matches]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((match) => ({
      key: match.key,
      number: numbers.get(match.key) ?? 0,
      time: match.scheduledAt ? formatBerlinClock(match.scheduledAt) : "—",
      fieldName: match.fieldId ? (fieldNameById.get(match.fieldId) ?? "Unbekanntes Feld") : "—",
      homeName: participantName(match.home, input.teamLabels),
      awayName: participantName(match.away, input.teamLabels),
      result: "—",
    }));
  const rowByKey = new Map(rows.map((row) => [row.key, row]));
  const timelineRows = layout === "cl-multi"
    ? groupMatchesByTimeslot(matches, input.fields.map((field) => field.id)).map((timeline) => ({
        scheduledAt: timeline.scheduledAt,
        cells: timeline.cells.map((cell) => ({
          fieldId: cell.fieldId,
          match: cell.match ? (rowByKey.get(cell.match.key) ?? null) : null,
        })),
      }))
    : null;

  const participantKeys = input.preview.memberships
    .map((membership) => previewParticipantKey(membership.participant))
    .filter((key): key is string => Boolean(key));
  const participants = participantKeys.map((key) => input.teamLabels[key] ?? "Unbenannte Mannschaft");
  const standings = pdfLayoutShowsStandings(layout)
    ? input.preview.groups.map((group) => {
        const names = input.preview.memberships
          .filter((membership) => membership.groupKey === group.key)
          .map((membership) => participantName(membership.participant, input.teamLabels));
        return {
          title: group.name,
          rows: emptyStandingRows(names, input.preview.mode === "champions-league" ? input.knockoutCutoff : null),
        };
      })
    : [];
  const fieldCount = input.fields.length;
  const meta = [
    `${input.tournament.matchDurationMinutes} Min Spielzeit`,
    `${input.tournament.breakMinutes} Min Wechselzeit`,
    `${fieldCount} ${fieldCount === 1 ? "Feld" : "Felder"}`,
  ];
  if (input.preview.mode === "champions-league") {
    if (input.matchesPerTeam != null) meta.push(`${input.matchesPerTeam} Spiele/Team`);
    if (input.knockoutCutoff != null) meta.push(`Top ${input.knockoutCutoff}`);
  }

  return {
    layout,
    draft: true,
    tournamentName: input.tournament.name,
    dateLabel: dateLabel(input.tournament.date),
    startTimeLabel: input.tournament.startTime,
    location: input.tournament.location,
    description: input.tournament.description,
    modeLabel: input.preview.mode === "champions-league" ? "Champions League" : input.preview.mode === "groups-knockout" ? "Gruppenphase + K.-o.-Runde" : "Jeder gegen jeden",
    metaLine: meta.join(" · "),
    participants,
    scheduleTitle: input.preview.mode === "champions-league" ? "Ligaphase – Spielplan" : "Spielplan",
    singleColumnMatches: rows,
    timelineRows,
    fieldNames: input.fields.map((field) => field.name),
    standings,
    showStandings: pdfLayoutShowsStandings(layout),
    knockoutTitle: input.preview.mode === "champions-league" ? "K.-o.-Runde (Endrunde)" : "K.-o.-Runde",
    knockout: layout === "bambini"
      ? []
      : input.preview.mode === "champions-league"
        ? buildChampionsLeagueBracketRows(input.knockoutCutoff)
        : (() => {
            const planned = classicBracket(input.preview.koPlan);
            return planned.length > 0 ? planned : buildClassicBracketRows(input.preview.groups.length);
          })(),
  };
}

export function isDraftSchedulePdfEnvelope(value: unknown, tournamentId: string): value is DraftSchedulePdfEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DraftSchedulePdfEnvelope>;
  return candidate.version === 1 && candidate.tournamentId === tournamentId && Boolean(candidate.document);
}
