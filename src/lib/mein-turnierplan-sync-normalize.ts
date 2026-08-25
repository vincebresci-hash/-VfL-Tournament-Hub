import type { KnockoutRound, MatchPhase, MatchStatus } from "@/types/schedule";
import {
  normalizeMeinTurnierplanResponse,
  type NormalizedMeinTurnierplanGroup,
  type NormalizedMeinTurnierplanTeam,
} from "@/lib/mein-turnierplan-normalize";

export type NormalizedMeinTurnierplanCourt = {
  id: string;
  name: string;
  sortOrder: number;
};

export type NormalizedMeinTurnierplanMatch = {
  externalId: string;
  displayId: string | null;
  phase: MatchPhase;
  round: KnockoutRound | null;
  groupExternalId: string | null;
  courtIndex: number | null;
  scheduledAt: string | null;
  homeParticipantExternalId: string;
  awayParticipantExternalId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  decidedBy: "regular" | "penalties";
  sortOrder: number;
};

export type NormalizedMeinTurnierplanSyncPayload = {
  tournamentName: string | null;
  schemaVersion: string | null;
  groups: NormalizedMeinTurnierplanGroup[];
  teams: NormalizedMeinTurnierplanTeam[];
  courts: NormalizedMeinTurnierplanCourt[];
  matches: NormalizedMeinTurnierplanMatch[];
  completedMatchCount: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseScheduledAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = value.trim().replace(" ", "T");
  const date = new Date(`${normalized}+02:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function mapKnockoutRound(match: Record<string, unknown>): KnockoutRound | null {
  const mapping = asRecord(match.modeMapping);
  if (!mapping) {
    return null;
  }

  const round = typeof mapping.round === "number" ? mapping.round : null;
  const matchNo = typeof mapping.match === "number" ? mapping.match : null;
  const source1 = asRecord(match.sourceTeam1);
  const source2 = asRecord(match.sourceTeam2);
  const fromKnockout =
    source1?.type === "knockout" || source2?.type === "knockout";

  if (round === 2) {
    return "semifinal";
  }

  if (fromKnockout) {
    const rank1 = typeof source1?.rank === "number" ? source1.rank : null;
    const rank2 = typeof source2?.rank === "number" ? source2.rank : null;
    if (rank1 === 1 || rank2 === 1) {
      return "final";
    }
    return "third-place";
  }

  if (round === 1 && matchNo === 3) {
    return "placement-5";
  }

  if (round === 1 && matchNo === 4) {
    return "placement-7";
  }

  return "semifinal";
}

function normalizeCourts(raw: unknown): NormalizedMeinTurnierplanCourt[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((entry, index) => {
    const record = asRecord(entry);
    const displayId =
      typeof record?.displayId === "string" && record.displayId.trim()
        ? record.displayId.trim()
        : String(index + 1);
    return {
      id: displayId,
      name: `Feld ${displayId}`,
      sortOrder: index,
    };
  });
}

function normalizeMatchList(
  raw: unknown,
  phase: MatchPhase,
  groups: NormalizedMeinTurnierplanGroup[],
  sortOffset: number,
): NormalizedMeinTurnierplanMatch[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry, index) => {
    const record = asRecord(entry);
    if (!record) {
      return [];
    }

    const gameId =
      record.gameId != null
        ? String(record.gameId)
        : record.displayId != null
          ? String(record.displayId)
          : null;
    const home =
      record.homeParticipant != null ? String(record.homeParticipant) : null;
    const away =
      record.awayParticipant != null ? String(record.awayParticipant) : null;
    if (!gameId || !home || !away) {
      return [];
    }

    const homeScore = parseScore(record.score1);
    const awayScore = parseScore(record.score2);
    const hasResult = homeScore != null && awayScore != null;
    const groupIndex =
      typeof record.groupId === "number" && Number.isFinite(record.groupId)
        ? record.groupId
        : null;
    const groupExternalId =
      phase === "group" && groupIndex != null && groups[groupIndex]
        ? groups[groupIndex].id
        : null;

    return [
      {
        externalId: gameId,
        displayId: record.displayId != null ? String(record.displayId) : null,
        phase,
        round: phase === "knockout" ? mapKnockoutRound(record) : null,
        groupExternalId,
        courtIndex:
          typeof record.courtId === "number" && Number.isFinite(record.courtId)
            ? record.courtId
            : null,
        scheduledAt: parseScheduledAt(record.dateAndTime),
        homeParticipantExternalId: home,
        awayParticipantExternalId: away,
        homeScore,
        awayScore,
        status: hasResult
          ? "completed"
          : record.isActive === true
            ? "live"
            : "scheduled",
        decidedBy: record.withPenaltyShootout === true ? "penalties" : "regular",
        sortOrder: sortOffset + index,
      },
    ];
  });
}

export function normalizeMeinTurnierplanSyncPayload(
  raw: Record<string, unknown>,
):
  | { ok: true; payload: NormalizedMeinTurnierplanSyncPayload }
  | { ok: false; error: string } {
  const base = normalizeMeinTurnierplanResponse(raw);
  if (!base.ok) {
    return { ok: false, error: base.message };
  }

  const groups = base.normalized.groups;
  const teams = groups.flatMap((group) => group.teams);
  const courts = normalizeCourts(raw.courts);
  const groupMatches = normalizeMatchList(raw.groupMatches, "group", groups, 0);
  const finalMatches = normalizeMatchList(
    raw.finalMatches,
    "knockout",
    groups,
    groupMatches.length,
  );
  const matches = [...groupMatches, ...finalMatches];

  return {
    ok: true,
    payload: {
      tournamentName: base.normalized.tournamentName,
      schemaVersion: base.normalized.meta.schemaVersion,
      groups,
      teams,
      courts,
      matches,
      completedMatchCount: matches.filter((match) => match.status === "completed")
        .length,
    },
  };
}
