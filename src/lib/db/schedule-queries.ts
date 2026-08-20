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

function mapGroup(row: TournamentGroupRow): TournamentGroupRecord {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    sortOrder: row.sort_order,
  };
}

function mapField(row: TournamentFieldRow): TournamentFieldRecord {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    name: row.name,
    sortOrder: row.sort_order,
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
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: asMatchStatus(row.status),
    phase: asMatchPhase(row.phase),
    sortOrder: row.sort_order,
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
    memberIdsByGroupId[member.group_id] = [
      ...(memberIdsByGroupId[member.group_id] ?? []),
      member.application_id,
    ];
    groupIdByApplicationId[member.application_id] = member.group_id;
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
  const [rosterResult, groupsResult, fieldsResult, matchesResult] = await Promise.all([
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
      .eq("phase", "group")
      .order("sort_order", { ascending: true }),
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

  return {
    ready: !rosterResult.error,
    roster: ((rosterResult.data ?? []) as TournamentPublicRosterRow[]).map(mapRoster),
    groups: ((groupsResult.data ?? []) as TournamentGroupRow[]).map(mapGroup),
    fields: ((fieldsResult.data ?? []) as TournamentFieldRow[]).map(mapField),
    matches: ((matchesResult.data ?? []) as TournamentMatchRow[]).map(mapMatch),
  };
}
