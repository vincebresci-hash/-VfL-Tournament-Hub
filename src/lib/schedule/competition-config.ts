/**
 * Pure stored competition configuration.
 * No database, no server actions, no match generation.
 * Public display text is not an input and cannot select a mode.
 */

import { scheduleParticipantId } from "@/lib/schedule/admin";
import {
  expectedLeagueMatchCount,
  validateLeaguePhaseConfig,
  type LeagueKnockoutCutoff,
  type LeaguePhaseIssueCode,
} from "@/lib/schedule/league-phase";

export const COMPETITION_FORMATS = ["round-robin", "groups-knockout", "champions-league"] as const;

export type CompetitionFormat = (typeof COMPETITION_FORMATS)[number];

export type LegacyCompetitionFormat = Exclude<CompetitionFormat, "champions-league">;

export const COMPETITION_CONFIG_ISSUE_CODES = [
  "INVALID_COMPETITION_FORMAT",
  "INVALID_GROUP_COUNT",
  "FORMAT_PARAMS_MISMATCH",
  "FORMAT_GROUP_DISAGREEMENT",
  "CHAMPIONS_LEAGUE_MULTIPLE_GROUPS",
  "MISSING_LEAGUE_PARAMETERS",
  "INVALID_LEAGUE_MATCHES_PER_TEAM",
  "INVALID_KNOCKOUT_CUTOFF",
  "INVALID_PARTICIPANT_IDENTITY",
  "DUPLICATE_PARTICIPANT",
] as const;

export type CompetitionConfigIssueCode =
  | (typeof COMPETITION_CONFIG_ISSUE_CODES)[number]
  | LeaguePhaseIssueCode;

export type CompetitionConfigFailure = {
  ok: false;
  code: CompetitionConfigIssueCode;
  message: string;
};

export type ConfirmedParticipantIdentity = {
  applicationId: string | null;
  externalTeamId: string | null;
};

export type CompetitionTopologyState =
  | "legacy-round-robin"
  | "legacy-groups-knockout"
  | "explicit-round-robin"
  | "groups-knockout-awaiting-groups"
  | "explicit-groups-knockout"
  | "champions-league-configuration-only"
  | "champions-league-unverified-group";

export type ResolvedCompetitionTopology = {
  ok: true;
  storedFormat: CompetitionFormat | null;
  effectiveMode: CompetitionFormat;
  groupCount: number;
  state: CompetitionTopologyState;
  /** Advisory only. No Stage 3B.1 caller generates or deletes matches from this flag. */
  generationReady: boolean;
  /**
   * One stored group beside Champions League is not evidence of a league group.
   * This module cannot verify that group, so the flag stays false.
   */
  leagueGroupVerified: false;
};

export type StoredCompetitionColumns = {
  competitionFormat: CompetitionFormat | null;
  leagueMatchesPerTeam: number | null;
  knockoutCutoff: 4 | 8 | 16 | null;
};

export type ChampionsLeagueConfiguration = {
  participantIds: string[];
  matchesPerTeam: number;
  knockoutCutoff: LeagueKnockoutCutoff;
  expectedLeagueMatchCount: number;
};

function failure(code: CompetitionConfigIssueCode, message: string): CompetitionConfigFailure {
  return { ok: false, code, message };
}

function isCompetitionFormat(value: string): value is CompetitionFormat {
  return (COMPETITION_FORMATS as readonly string[]).includes(value);
}

function isStoredCutoff(value: number): value is 4 | 8 | 16 {
  return value === 4 || value === 8 || value === 16;
}

/** NULL stays legacy. Public display text is not a format. */
export function parseCompetitionFormat(
  value: unknown,
): { ok: true; format: CompetitionFormat | null } | CompetitionConfigFailure {
  if (value == null) {
    return { ok: true, format: null };
  }
  if (typeof value !== "string") {
    return failure(
      "INVALID_COMPETITION_FORMAT",
      "Der gespeicherte Spielplanmodus ist ungültig.",
    );
  }
  const format = value.trim();
  if (!isCompetitionFormat(format)) {
    return failure(
      "INVALID_COMPETITION_FORMAT",
      "Der gespeicherte Spielplanmodus ist ungültig.",
    );
  }
  return { ok: true, format };
}

/** Same rule as the current scheduler: groups mean groups-knockout, otherwise round robin. */
export function inferLegacyCompetitionMode(groupCount: number): LegacyCompetitionFormat {
  return groupCount > 0 ? "groups-knockout" : "round-robin";
}

export function resolveStoredCompetitionTopology(input: {
  competitionFormat: unknown;
  groupCount: number;
}): ResolvedCompetitionTopology | CompetitionConfigFailure {
  const parsed = parseCompetitionFormat(input.competitionFormat);
  if (!parsed.ok) {
    return parsed;
  }
  if (!Number.isSafeInteger(input.groupCount) || input.groupCount < 0) {
    return failure("INVALID_GROUP_COUNT", "Die Gruppenzahl ist ungültig.");
  }

  const storedFormat = parsed.format;
  const groupCount = input.groupCount;
  if (storedFormat == null) {
    const effectiveMode = inferLegacyCompetitionMode(groupCount);
    return {
      ok: true,
      storedFormat: null,
      effectiveMode,
      groupCount,
      state: effectiveMode === "round-robin" ? "legacy-round-robin" : "legacy-groups-knockout",
      generationReady: true,
      leagueGroupVerified: false,
    };
  }

  if (storedFormat === "round-robin") {
    if (groupCount > 0) {
      return failure(
        "FORMAT_GROUP_DISAGREEMENT",
        "Jeder gegen jeden passt nicht zu vorhandenen Gruppen.",
      );
    }
    return {
      ok: true,
      storedFormat,
      effectiveMode: "round-robin",
      groupCount,
      state: "explicit-round-robin",
      generationReady: true,
      leagueGroupVerified: false,
    };
  }

  if (storedFormat === "groups-knockout") {
    return {
      ok: true,
      storedFormat,
      effectiveMode: "groups-knockout",
      groupCount,
      state: groupCount === 0 ? "groups-knockout-awaiting-groups" : "explicit-groups-knockout",
      generationReady: groupCount > 0,
      leagueGroupVerified: false,
    };
  }

  if (groupCount > 1) {
    return failure(
      "CHAMPIONS_LEAGUE_MULTIPLE_GROUPS",
      "Champions League passt nicht zu mehreren Gruppen.",
    );
  }

  return {
    ok: true,
    storedFormat: "champions-league",
    effectiveMode: "champions-league",
    groupCount,
    state:
      groupCount === 0
        ? "champions-league-configuration-only"
        : "champions-league-unverified-group",
    generationReady: false,
    leagueGroupVerified: false,
  };
}

export function validateStoredCompetitionColumns(input: {
  competitionFormat: unknown;
  leagueMatchesPerTeam: number | null;
  knockoutCutoff: number | null;
}): { ok: true; columns: StoredCompetitionColumns } | CompetitionConfigFailure {
  const parsed = parseCompetitionFormat(input.competitionFormat);
  if (!parsed.ok) {
    return parsed;
  }

  const matches = input.leagueMatchesPerTeam;
  const cutoff = input.knockoutCutoff;
  if (matches != null && (!Number.isInteger(matches) || matches < 1 || matches > 64)) {
    return failure(
      "INVALID_LEAGUE_MATCHES_PER_TEAM",
      "Die Spiele pro Team müssen eine ganze Zahl von 1 bis 64 sein.",
    );
  }
  if (cutoff != null && !isStoredCutoff(cutoff)) {
    return failure(
      "INVALID_KNOCKOUT_CUTOFF",
      "Die K.-o.-Qualifikation unterstützt nur die ersten 4, 8 oder 16 Teams.",
    );
  }

  const championsLeague = parsed.format === "champions-league";
  const hasAnyParam = matches != null || cutoff != null;
  const hasBothParams = matches != null && cutoff != null;
  if (championsLeague ? !hasBothParams : hasAnyParam) {
    return failure(
      "FORMAT_PARAMS_MISMATCH",
      championsLeague
        ? "Champions League braucht Spiele pro Team und eine K.-o.-Qualifikation."
        : "Spiele pro Team und K.-o.-Qualifikation gehören nur zur Champions League.",
    );
  }

  return {
    ok: true,
    columns: {
      competitionFormat: parsed.format,
      leagueMatchesPerTeam: matches,
      knockoutCutoff: cutoff,
    },
  };
}

export function validateConfirmedParticipantIdentities(
  participants: readonly ConfirmedParticipantIdentity[],
): { ok: true; participantIds: string[] } | CompetitionConfigFailure {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const participant of participants) {
    const hasApplication = typeof participant.applicationId === "string" && participant.applicationId.trim() !== "";
    const hasExternal = typeof participant.externalTeamId === "string" && participant.externalTeamId.trim() !== "";
    if (hasApplication === hasExternal) {
      return failure(
        "INVALID_PARTICIPANT_IDENTITY",
        "Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.",
      );
    }
    const id = scheduleParticipantId({
      applicationId: hasApplication ? participant.applicationId : null,
      externalTeamId: hasExternal ? participant.externalTeamId : null,
    });
    if (!id) {
      return failure(
        "INVALID_PARTICIPANT_IDENTITY",
        "Jeder Teilnehmer braucht genau eine Bewerbung oder genau ein externes Team.",
      );
    }
    if (seen.has(id)) {
      return failure("DUPLICATE_PARTICIPANT", "Ein Team darf nur einmal gesetzt sein.");
    }
    seen.add(id);
    ids.push(id);
  }
  ids.sort((left, right) => left.localeCompare(right));
  return { ok: true, participantIds: ids };
}

export function validateChampionsLeagueConfiguration(input: {
  matchesPerTeam: number | null;
  knockoutCutoff: number | null;
  participants: readonly ConfirmedParticipantIdentity[];
}): { ok: true; config: ChampionsLeagueConfiguration } | CompetitionConfigFailure {
  if (input.matchesPerTeam == null || input.knockoutCutoff == null) {
    return failure(
      "MISSING_LEAGUE_PARAMETERS",
      "Champions League braucht Spiele pro Team und eine K.-o.-Qualifikation.",
    );
  }
  if (!Number.isInteger(input.matchesPerTeam) || input.matchesPerTeam < 1 || input.matchesPerTeam > 64) {
    return failure(
      "INVALID_LEAGUE_MATCHES_PER_TEAM",
      "Die Spiele pro Team müssen eine ganze Zahl von 1 bis 64 sein.",
    );
  }
  if (!isStoredCutoff(input.knockoutCutoff)) {
    return failure(
      "INVALID_KNOCKOUT_CUTOFF",
      "Die K.-o.-Qualifikation unterstützt nur die ersten 4, 8 oder 16 Teams.",
    );
  }

  const identities = validateConfirmedParticipantIdentities(input.participants);
  if (!identities.ok) {
    return identities;
  }

  const validated = validateLeaguePhaseConfig({
    teamIds: identities.participantIds,
    matchesPerTeam: input.matchesPerTeam,
    knockoutCutoff: input.knockoutCutoff,
  });
  if (!validated.ok) {
    return validated;
  }

  const expected = expectedLeagueMatchCount(
    validated.config.teamIds.length,
    validated.config.matchesPerTeam,
  );
  if (expected == null) {
    return failure(
      "UNEVEN_MATCH_TOTAL",
      "Die Gesamtzahl der Ligabegegnungen muss ganzzahlig sein.",
    );
  }

  return {
    ok: true,
    config: {
      participantIds: validated.config.teamIds,
      matchesPerTeam: validated.config.matchesPerTeam,
      knockoutCutoff: validated.config.knockoutCutoff,
      expectedLeagueMatchCount: expected,
    },
  };
}
