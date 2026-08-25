import type { NormalizedMeinTurnierplanSyncPayload } from "@/lib/mein-turnierplan-sync-normalize";
import type { SyncTeamMapping } from "@/lib/mein-turnierplan-sync";

export type MeinTurnierplanSyncRpcPayload = {
  source: "mein-turnierplan";
  externalTournamentId: string;
  syncedAt: string;
  teams: Array<{
    externalId: string;
    name: string;
    applicationId: string | null;
    logoUrl: string | null;
  }>;
  groups: Array<{
    externalId: string;
    name: string;
    sortOrder: number;
    teamExternalIds: string[];
  }>;
  fields: Array<{
    externalId: string;
    name: string;
    sortOrder: number;
  }>;
  matches: Array<{
    externalId: string;
    phase: string;
    round: string | null;
    groupExternalId: string | null;
    fieldExternalId: string | null;
    homeTeamExternalId: string;
    awayTeamExternalId: string;
    scheduledAt: string | null;
    homeScore: number | null;
    awayScore: number | null;
    status: string;
    decidedBy: string;
    sortOrder: number;
  }>;
};

export type MeinTurnierplanSyncRpcResult = {
  success: boolean;
  teamsInserted: number;
  teamsUpdated: number;
  groupsInserted: number;
  groupsUpdated: number;
  fieldsInserted: number;
  fieldsUpdated: number;
  matchesInserted: number;
  matchesUpdated: number;
  protectedOverrides: number;
  deactivatedTeams: number;
  deactivatedGroups: number;
  deactivatedFields: number;
  deactivatedMatches: number;
};

export function buildMeinTurnierplanSyncRpcPayload(input: {
  queryId: string;
  payload: NormalizedMeinTurnierplanSyncPayload;
  mappings: SyncTeamMapping[];
  syncedAt?: string;
}): MeinTurnierplanSyncRpcPayload {
  const mappingByExternalId = new Map(
    input.mappings.map((mapping) => [mapping.externalId, mapping.applicationId]),
  );
  const courtIdByIndex = new Map(
    input.payload.courts.map((court, index) => [index, court.id]),
  );

  return {
    source: "mein-turnierplan",
    externalTournamentId: input.queryId,
    syncedAt: input.syncedAt ?? new Date().toISOString(),
    teams: input.payload.teams.map((team) => ({
      externalId: team.id,
      name: team.name,
      applicationId: mappingByExternalId.get(team.id) ?? null,
      logoUrl: team.logoUrl ?? null,
    })),
    groups: input.payload.groups.map((group, index) => ({
      externalId: group.id,
      name: group.name,
      sortOrder: index,
      teamExternalIds: group.teams.map((member) => member.id),
    })),
    fields: input.payload.courts.map((court) => ({
      externalId: court.id,
      name: court.name,
      sortOrder: court.sortOrder,
    })),
    matches: input.payload.matches.map((match) => ({
      externalId: match.externalId,
      phase: match.phase,
      round: match.round,
      groupExternalId: match.groupExternalId,
      fieldExternalId:
        match.courtIndex != null ? (courtIdByIndex.get(match.courtIndex) ?? null) : null,
      homeTeamExternalId: match.homeParticipantExternalId,
      awayTeamExternalId: match.awayParticipantExternalId,
      scheduledAt: match.scheduledAt,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.status,
      decidedBy: match.decidedBy,
      sortOrder: match.sortOrder,
    })),
  };
}

export class MeinTurnierplanSyncRpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeinTurnierplanSyncRpcValidationError";
  }
}

function assertRpcCondition(condition: unknown, message: string) {
  if (!condition) {
    throw new MeinTurnierplanSyncRpcValidationError(message);
  }
}

function uniqueCount(values: string[]) {
  return new Set(values).size;
}

export function validateMeinTurnierplanSyncRpcPayload(payload: MeinTurnierplanSyncRpcPayload) {
  assertRpcCondition(payload.source === "mein-turnierplan", "Invalid payload source");
  assertRpcCondition(Array.isArray(payload.teams), "teams must be an array");
  assertRpcCondition(Array.isArray(payload.groups), "groups must be an array");
  assertRpcCondition(Array.isArray(payload.fields), "fields must be an array");
  assertRpcCondition(Array.isArray(payload.matches), "matches must be an array");

  const teamIds = payload.teams.map((team) => team.externalId.trim());
  assertRpcCondition(
    teamIds.every((externalId) => externalId.length > 0),
    "Team external ID must not be empty",
  );
  assertRpcCondition(
    uniqueCount(teamIds) === teamIds.length,
    "Duplicate team external IDs in payload",
  );

  const groupIds = payload.groups.map((group) => group.externalId.trim());
  assertRpcCondition(
    groupIds.every((externalId) => externalId.length > 0),
    "Group external ID must not be empty",
  );
  assertRpcCondition(
    uniqueCount(groupIds) === groupIds.length,
    "Duplicate group external IDs in payload",
  );

  const fieldIds = payload.fields.map((field) => field.externalId.trim());
  assertRpcCondition(
    fieldIds.every((externalId) => externalId.length > 0),
    "Field external ID must not be empty",
  );
  assertRpcCondition(
    uniqueCount(fieldIds) === fieldIds.length,
    "Duplicate field external IDs in payload",
  );

  const teamIdSet = new Set(teamIds);
  const groupIdSet = new Set(groupIds);
  const fieldIdSet = new Set(fieldIds);

  for (const group of payload.groups) {
    assertRpcCondition(Array.isArray(group.teamExternalIds), "Group teamExternalIds must be an array");
    for (const memberId of group.teamExternalIds) {
      assertRpcCondition(memberId.trim().length > 0, "Group member external ID must not be empty");
      assertRpcCondition(
        teamIdSet.has(memberId),
        "Group references unknown team external ID",
      );
    }
  }

  const matchIds = payload.matches.map((match) => match.externalId.trim());
  assertRpcCondition(
    matchIds.every((externalId) => externalId.length > 0),
    "Match external ID must not be empty",
  );
  assertRpcCondition(
    uniqueCount(matchIds) === matchIds.length,
    "Duplicate match external IDs in payload",
  );

  for (const match of payload.matches) {
    assertRpcCondition(
      match.homeTeamExternalId.trim().length > 0 && match.awayTeamExternalId.trim().length > 0,
      "Match teams must not be empty",
    );
    assertRpcCondition(
      match.homeTeamExternalId !== match.awayTeamExternalId,
      "Match teams must be different",
    );
    assertRpcCondition(
      teamIdSet.has(match.homeTeamExternalId),
      "Match references unknown home team",
    );
    assertRpcCondition(
      teamIdSet.has(match.awayTeamExternalId),
      "Match references unknown away team",
    );

    if (match.groupExternalId) {
      assertRpcCondition(
        groupIdSet.has(match.groupExternalId),
        "Match references unknown group",
      );
    }

    if (match.fieldExternalId) {
      assertRpcCondition(
        fieldIdSet.has(match.fieldExternalId),
        "Match references unknown field",
      );
    }
  }
}
