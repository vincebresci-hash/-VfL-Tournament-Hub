/**
 * Local Champions League admin preview.
 * Pure: no database, no server actions, no persistence.
 * The public play_format text is not read and cannot select this mode.
 */

import {
  berlinWallTimeToIso,
  normalizeClock,
  wallTimeOnDate,
} from "@/lib/schedule/datetime";
import {
  buildLeagueKnockoutPlan,
  expectedLeagueMatchCount,
  validateLeaguePhaseConfig,
  type LeagueKnockoutCutoff,
} from "@/lib/schedule/league-phase";

export type { LeagueKnockoutCutoff };
import {
  buildTournamentPlanPreview,
  type PlanPreviewTimingInput,
  type TournamentPlanPreview,
} from "@/lib/schedule/plan-preview";
import { scheduleParticipantId } from "@/lib/schedule/admin";

export const ADMIN_COMPETITION_MODES = [
  "round-robin",
  "groups-knockout",
  "champions-league",
] as const;

export type AdminCompetitionMode = (typeof ADMIN_COMPETITION_MODES)[number];

export const ADMIN_COMPETITION_MODE_LABELS: Record<AdminCompetitionMode, string> = {
  "round-robin": "Jeder gegen jeden",
  "groups-knockout": "Gruppenphase + K.-o.-Runde",
  "champions-league": "Champions League",
};

/** Knockout skeleton used only to count matches. It is not scheduled or saved. */
const LEAGUE_KNOCKOUT_COUNT_OPTIONS = {
  includeThirdPlace: true,
  includePlacement5: false,
  includePlacement7: false,
} as const;

export type LeagueAdminParticipant = {
  applicationId: string | null;
  externalTeamId: string | null;
};

export type ChampionsLeagueAdminDescription = {
  participantCount: number;
  matchesPerTeam: number | null;
  knockoutCutoff: LeagueKnockoutCutoff;
  expectedLeagueMatchCount: number | null;
  expectedKnockoutMatchCount: number | null;
  ok: boolean;
  code: string | null;
  message: string | null;
};

export function savedCompetitionMode(groupCount: number): Exclude<AdminCompetitionMode, "champions-league"> {
  return groupCount > 0 ? "groups-knockout" : "round-robin";
}

export const PREVIEW_ONLY_SCHEDULE_LOCK_MESSAGE =
  "Vorschaumodus: Änderungen am gespeicherten Spielplan sind deaktiviert. Wähle den gespeicherten Modus, um Spiele zu bearbeiten oder zu löschen. Spielparameter und Spielfelder sind dabei ebenfalls gesperrt.";

/** Saved schedule mutations stay available only for the mode already stored on the tournament. */
export function scheduleEditingEnabled(
  selected: AdminCompetitionMode,
  saved: AdminCompetitionMode,
) {
  return selected === saved;
}

export function parseMatchesPerTeam(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function championsLeagueParticipantIds(participants: readonly LeagueAdminParticipant[]): string[] {
  const ids = new Set<string>();
  for (const participant of participants) {
    const hasApplication = Boolean(participant.applicationId);
    const hasExternal = Boolean(participant.externalTeamId);
    if (hasApplication === hasExternal) {
      continue;
    }
    const id = scheduleParticipantId(participant);
    if (id) {
      ids.add(id);
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

export function expectedLeagueKnockoutMatchCount(cutoff: LeagueKnockoutCutoff): number | null {
  const ranked = Array.from({ length: cutoff }, (_, index) => ({
    participantId: `rank-${index + 1}`,
    rank: index + 1,
  }));
  const plan = buildLeagueKnockoutPlan(
    { format: cutoff, ...LEAGUE_KNOCKOUT_COUNT_OPTIONS },
    ranked,
  );
  if (plan.error || plan.matches.length === 0) {
    return null;
  }
  return plan.matches.length;
}

export function describeChampionsLeagueConfig(input: {
  participantIds: readonly string[];
  matchesPerTeam: number | null;
  knockoutCutoff: LeagueKnockoutCutoff;
}): ChampionsLeagueAdminDescription {
  const participantIds = [...input.participantIds];
  if (input.matchesPerTeam == null) {
    return {
      participantCount: participantIds.length,
      matchesPerTeam: null,
      knockoutCutoff: input.knockoutCutoff,
      expectedLeagueMatchCount: null,
      expectedKnockoutMatchCount: null,
      ok: false,
      code: "INVALID_MATCHES_PER_TEAM",
      message: "Die Spiele pro Team müssen eine ganze Zahl sein.",
    };
  }

  const validated = validateLeaguePhaseConfig({
    teamIds: participantIds,
    matchesPerTeam: input.matchesPerTeam,
    knockoutCutoff: input.knockoutCutoff,
  });
  if (!validated.ok) {
    return {
      participantCount: participantIds.length,
      matchesPerTeam: input.matchesPerTeam,
      knockoutCutoff: input.knockoutCutoff,
      expectedLeagueMatchCount: null,
      expectedKnockoutMatchCount: null,
      ok: false,
      code: validated.code,
      message: validated.message,
    };
  }

  return {
    participantCount: participantIds.length,
    matchesPerTeam: validated.config.matchesPerTeam,
    knockoutCutoff: validated.config.knockoutCutoff,
    expectedLeagueMatchCount: expectedLeagueMatchCount(
      validated.config.teamIds.length,
      validated.config.matchesPerTeam,
    ),
    expectedKnockoutMatchCount: expectedLeagueKnockoutMatchCount(validated.config.knockoutCutoff),
    ok: true,
    code: null,
    message: null,
  };
}

export function savedTournamentPlanTiming(tournament: {
  date: string;
  startTime: string | null;
  matchDurationMinutes: number;
  breakMinutes: number;
  minimumRestMinutes: number;
  lunchBreakStart: string | null;
  lunchBreakEnd: string | null;
}): PlanPreviewTimingInput {
  const date = tournament.date.slice(0, 10);
  const startTime = normalizeClock(tournament.startTime, "09:00");
  const lunchStart = wallTimeOnDate(date, tournament.lunchBreakStart);
  const lunchEnd = wallTimeOnDate(date, tournament.lunchBreakEnd);
  return {
    startIso: berlinWallTimeToIso(date, startTime),
    durationMinutes: tournament.matchDurationMinutes,
    breakMinutes: tournament.breakMinutes,
    minimumRestMinutes: tournament.minimumRestMinutes,
    lunchStartIso: lunchStart ? lunchStart.toISOString() : null,
    lunchEndIso: lunchEnd ? lunchEnd.toISOString() : null,
  };
}

export function buildChampionsLeagueAdminPreview(input: {
  participants: readonly LeagueAdminParticipant[];
  matchesPerTeam: number | null;
  knockoutCutoff: LeagueKnockoutCutoff;
  fields: Array<{ id: string; name: string }>;
  timing: PlanPreviewTimingInput;
  restrictSameClub?: boolean;
  /** Stable club identity per participant key (null = no shared club). */
  clubByParticipantId?: Readonly<Record<string, string | null>>;
}): TournamentPlanPreview {
  const participantIds = championsLeagueParticipantIds(input.participants);
  const byId = new Map<string, LeagueAdminParticipant>();
  for (const participant of input.participants) {
    const id = scheduleParticipantId(participant);
    if (id && !byId.has(id)) {
      byId.set(id, participant);
    }
  }

  const restrictSameClub = input.restrictSameClub === true;
  const clubByParticipantId: Record<string, string | null> = {};
  if (restrictSameClub) {
    for (const id of participantIds) {
      clubByParticipantId[id] = input.clubByParticipantId?.[id] ?? null;
    }
  }

  return buildTournamentPlanPreview({
    mode: "champions-league",
    participants: participantIds.map((id) => {
      const participant = byId.get(id);
      return {
        applicationId: participant?.applicationId ?? null,
        externalTeamId: participant?.externalTeamId ?? null,
      };
    }),
    fields: input.fields.map((field) => ({ id: field.id, name: field.name })),
    timing: input.timing,
    championsLeague: {
      participantIds,
      matchesPerTeam: input.matchesPerTeam ?? Number.NaN,
      knockoutCutoff: input.knockoutCutoff,
      restrictSameClub,
      clubByParticipantId,
    },
  });
}
