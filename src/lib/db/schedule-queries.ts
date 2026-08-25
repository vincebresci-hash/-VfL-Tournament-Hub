import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import type {
  TournamentFieldRow,
  TournamentGroupMemberRow,
  TournamentGroupRow,
  TournamentMatchRow,
  TournamentPublicRosterRow,
} from "@/lib/supabase/database";
import type {
  DecidedBy,
  KnockoutRound,
  KnockoutSlot,
  MatchPhase,
  MatchStatus,
  PublicRosterEntry,
  TournamentFieldRecord,
  TournamentGroupRecord,
  TournamentMatchRecord,
} from "@/types/schedule";

export type AdminTournamentStage = {
  ready: boolean;
  groups: TournamentGroupRecord[];
  memberIdsByGroupId: Record<string, string[]>;
  groupIdByApplicationId: Record<string, string>;
  fields: TournamentFieldRecord[];
  matches: TournamentMatchRecord[];
};

export type PublicTournamentStage = {
  ready: boolean;
  roster: PublicRosterEntry[];
  groups: TournamentGroupRecord[];
  fields: TournamentFieldRecord[];
  matches: TournamentMatchRecord[];
};

function asMatchStatus(value: string | null | undefined): MatchStatus {
  if (
    value === "scheduled" ||
    value === "live" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "scheduled";
}

function asMatchPhase(value: string | null | undefined): MatchPhase {
  return value === "knockout" ? "knockout" : "group";
}

function asKnockoutRound(value: string | null | undefined): KnockoutRound | null {
  if (
    value === "quarterfinal" ||
    value === "semifinal" ||
    value === "third-place" ||
    value === "final" ||
    value === "placement-5" ||
    value === "placement-7"
  ) {
    return value;
  }

  return null;
}

function asKnockoutSlot(value: string | null | undefined): KnockoutSlot | null {
  return value === "home" || value === "away" ? value : null;
}

function asDecidedBy(value: string | null | undefined): DecidedBy {
  return value === "penalties" ? "penalties" : "regular";
}

function mapGroup(row: TournamentGroupRow): TournamentGroupRecord {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    sortOrder: row.sort_order,
    externalSource: row.external_source ?? null,
    externalId: row.external_id ?? null,
    manualOverride: Boolean(row.manual_override),
  };
}

function mapField(row: TournamentFieldRow): TournamentFieldRecord {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    sortOrder: row.sort_order,
    externalSource: row.external_source ?? null,
    externalId: row.external_id ?? null,
    manualOverride: Boolean(row.manual_override),
  };
}

function mapMatch(row: TournamentMatchRow): TournamentMatchRecord {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    groupId: row.group_id,
    fieldId: row.field_id,
    homeApplicationId: row.home_application_id,
    awayApplicationId: row.away_application_id,
    homeExternalTeamId: row.home_external_team_id ?? null,
    awayExternalTeamId: row.away_external_team_id ?? null,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: asMatchStatus(row.status),
    phase: asMatchPhase(row.phase),
    sortOrder: row.sort_order,
    round: asKnockoutRound(row.round),
    nextMatchId: row.next_match_id ?? null,
    nextMatchSlot: asKnockoutSlot(row.next_match_slot),
    loserNextMatchId: row.loser_next_match_id ?? null,
    loserNextMatchSlot: asKnockoutSlot(row.loser_next_match_slot),
    decidedBy: asDecidedBy(row.decided_by),
    homePenalties: row.home_penalties ?? null,
    awayPenalties: row.away_penalties ?? null,
    externalSource: row.external_source ?? null,
    externalId: row.external_id ?? null,
    manualOverride: Boolean(row.manual_override),
  };
}

function mapRoster(row: TournamentPublicRosterRow): PublicRosterEntry {
  return {
    applicationId: row.application_id,
    clubName: row.club_name?.trim() || "Verein",
    teamName: row.team_name?.trim() || "Mannschaft",
    ageGroup: row.age_group,
    birthYear: row.birth_year,
    groupId: row.group_id,
    groupName: row.group_name,
    groupSortOrder: row.group_sort_order,
  };
}

function emptyStage(ready: boolean): AdminTournamentStage {
  return {
    ready,
    groups: [],
    memberIdsByGroupId: {},
    groupIdByApplicationId: {},
    fields: [],
    matches: [],
  };
}

export async function getAdminTournamentStage(
  tournamentId: string,
): Promise<AdminTournamentStage> {
  const supabase = await createClient();
  const [groupsResult, fieldsResult, matchesResult] = await Promise.all([
    supabase
      .from("tournament_groups")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tournament_fields")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
  ]);

  if (
    groupsResult.error &&
    isMissingRelationError(groupsResult.error)
  ) {
    return emptyStage(false);
  }

  if (groupsResult.error || fieldsResult.error || matchesResult.error) {
    return emptyStage(false);
  }

  const groups = ((groupsResult.data ?? []) as TournamentGroupRow[]).map(mapGroup);
  const groupIds = groups.map((group) => group.id);
  const membersResult =
    groupIds.length === 0
      ? { data: [] as TournamentGroupMemberRow[], error: null }
      : await supabase
          .from("tournament_group_members")
          .select("*")
          .in("group_id", groupIds);

  if (membersResult.error && !isMissingRelationError(membersResult.error)) {
    return emptyStage(false);
  }

  const members = (membersResult.data ?? []) as TournamentGroupMemberRow[];
  const memberIdsByGroupId: Record<string, string[]> = {};
  const groupIdByApplicationId: Record<string, string> = {};

  for (const group of groups) {
    memberIdsByGroupId[group.id] = [];
  }

  for (const member of members) {
    const participantId = member.application_id ?? member.external_team_id;
    if (!participantId) {
      continue;
    }

    memberIdsByGroupId[member.group_id] = [
      ...(memberIdsByGroupId[member.group_id] ?? []),
      participantId,
    ];
    groupIdByApplicationId[participantId] = member.group_id;
  }

  return {
    ready: true,
    groups,
    memberIdsByGroupId,
    groupIdByApplicationId,
    fields: ((fieldsResult.data ?? []) as TournamentFieldRow[]).map(mapField),
    matches: ((matchesResult.data ?? []) as TournamentMatchRow[]).map(mapMatch),
  };
}

export async function getPublicTournamentStage(
  slug: string,
  tournamentId: string,
): Promise<PublicTournamentStage> {
  const supabase = await createClient();
  const [rosterResult, groupsResult, fieldsResult, matchesResult, externalTeamsResult] =
    await Promise.all([
      supabase.rpc("tournament_public_roster", { p_slug: slug }),
      supabase
        .from("tournament_groups")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tournament_fields")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tournament_external_teams")
        .select("id, name, application_id, participation_status, external_active")
        .eq("tournament_id", tournamentId),
    ]);

  const missing =
    (rosterResult.error && isMissingRelationError(rosterResult.error)) ||
    (groupsResult.error && isMissingRelationError(groupsResult.error));

  if (missing) {
    return {
      ready: false,
      roster: [],
      groups: [],
      fields: [],
      matches: [],
    };
  }

  const groups = ((groupsResult.data ?? []) as TournamentGroupRow[]).map(mapGroup);
  const applicationRoster = ((rosterResult.data ?? []) as TournamentPublicRosterRow[]).map(
    mapRoster,
  );
  const applicationIds = new Set(applicationRoster.map((entry) => entry.applicationId));

  const groupIds = groups.map((group) => group.id);
  const membersResult =
    groupIds.length === 0
      ? { data: [] as TournamentGroupMemberRow[], error: null }
      : await supabase.from("tournament_group_members").select("*").in("group_id", groupIds);
  const members = (membersResult.data ?? []) as TournamentGroupMemberRow[];
  const groupByExternalTeamId = new Map<string, TournamentGroupRecord>();
  for (const member of members) {
    if (!member.external_team_id) {
      continue;
    }
    const group = groups.find((entry) => entry.id === member.group_id);
    if (group) {
      groupByExternalTeamId.set(member.external_team_id, group);
    }
  }

  const externalRoster: PublicRosterEntry[] = ((externalTeamsResult.data ?? []) as Array<{
    id: string;
    name: string;
    application_id: string | null;
    participation_status?: string | null;
    external_active?: boolean | null;
  }>)
    .filter((team) => team.external_active !== false)
    .filter((team) => (team.participation_status ?? "detected") === "confirmed")
    .filter((team) => !team.application_id || !applicationIds.has(team.application_id))
    .map((team) => {
      const group = groupByExternalTeamId.get(team.id) ?? null;
      return {
        applicationId: team.application_id ?? team.id,
        clubName: team.name,
        teamName: team.name,
        ageGroup: null,
        birthYear: null,
        groupId: group?.id ?? null,
        groupName: group?.name ?? null,
        groupSortOrder: group?.sortOrder ?? null,
        source: "mein-turnierplan" as const,
        externalTeamId: team.id,
      };
    });

  return {
    ready: !rosterResult.error,
    roster: [...applicationRoster, ...externalRoster],
    groups,
    fields: ((fieldsResult.data ?? []) as TournamentFieldRow[]).map(mapField),
    matches: ((matchesResult.data ?? []) as TournamentMatchRow[]).map(mapMatch),
  };
}
