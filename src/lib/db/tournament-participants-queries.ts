import { createClient } from "@/lib/supabase/server";
import {
  mergeTournamentParticipants,
  type TournamentParticipant,
} from "@/lib/tournament-participants";
import type { TournamentPublicRosterRow } from "@/lib/supabase/database";

export async function getTournamentParticipants(
  tournamentId: string,
): Promise<TournamentParticipant[]> {
  const supabase = await createClient();

  const [applicationsResult, externalResult, groupsResult] = await Promise.all([
    supabase
      .from("applications")
      .select("id, club_name, team_name, age_group, birth_year, status")
      .eq("tournament_id", tournamentId)
      .eq("status", "accepted"),
    supabase
      .from("tournament_external_teams")
      .select(
        "id, external_source, external_id, name, club_name, team_name, application_id, participation_status, external_active, age_group, birth_year",
      )
      .eq("tournament_id", tournamentId),
    supabase
      .from("tournament_groups")
      .select("id, name, sort_order")
      .eq("tournament_id", tournamentId),
  ]);

  const groups = groupsResult.data ?? [];
  const groupIds = groups.map((group) => String(group.id));
  const groupNameById = new Map(groups.map((group) => [String(group.id), String(group.name)]));

  const membersResult =
    groupIds.length === 0
      ? { data: [] as Array<{ group_id: string; application_id: string | null; external_team_id: string | null }> }
      : await supabase
          .from("tournament_group_members")
          .select("group_id, application_id, external_team_id")
          .in("group_id", groupIds);

  const groupByApplicationId = new Map<string, { groupId: string; groupName: string }>();
  const groupByExternalTeamId = new Map<string, { groupId: string; groupName: string }>();

  for (const member of membersResult.data ?? []) {
    const groupId = String(member.group_id);
    const groupName = groupNameById.get(groupId) ?? "";
    if (member.application_id) {
      groupByApplicationId.set(String(member.application_id), { groupId, groupName });
    }
    if (member.external_team_id) {
      groupByExternalTeamId.set(String(member.external_team_id), { groupId, groupName });
    }
  }

  return mergeTournamentParticipants({
    applications: (applicationsResult.data ?? []).map((row) => {
      const group = groupByApplicationId.get(String(row.id));
      return {
        id: String(row.id),
        clubName: String(row.club_name ?? "Verein"),
        teamName: String(row.team_name ?? "Mannschaft"),
        ageGroup: row.age_group ? String(row.age_group) : null,
        birthYear: row.birth_year ?? null,
        groupId: group?.groupId ?? null,
        groupName: group?.groupName ?? null,
      };
    }),
    externalTeams: (externalResult.data ?? []).map((row) => {
      const group = groupByExternalTeamId.get(String(row.id));
      return {
        id: String(row.id),
        externalSource: String(row.external_source ?? "mein-turnierplan"),
        name: String(row.name),
        clubName: row.club_name ? String(row.club_name) : null,
        teamName: row.team_name ? String(row.team_name) : null,
        applicationId: row.application_id ? String(row.application_id) : null,
        participationStatus: String(row.participation_status ?? "detected"),
        externalActive: row.external_active !== false,
        ageGroup: row.age_group ? String(row.age_group) : null,
        birthYear: row.birth_year ?? null,
        groupId: group?.groupId ?? null,
        groupName: group?.groupName ?? null,
      };
    }),
  });
}

export async function getTournamentParticipantsFromRoster(
  slug: string,
  tournamentId: string,
): Promise<TournamentParticipant[]> {
  const supabase = await createClient();
  const rosterResult = await supabase.rpc("tournament_public_roster", { p_slug: slug });
  const roster = (rosterResult.data ?? []) as TournamentPublicRosterRow[];

  const externalResult = await supabase
    .from("tournament_external_teams")
    .select(
      "id, external_source, external_id, name, club_name, team_name, application_id, participation_status, external_active, age_group, birth_year",
    )
    .eq("tournament_id", tournamentId);

  const groupsResult = await supabase
    .from("tournament_groups")
    .select("id, name")
    .eq("tournament_id", tournamentId);

  const groupIds = (groupsResult.data ?? []).map((group) => String(group.id));
  const membersResult =
    groupIds.length === 0
      ? { data: [] as Array<{ group_id: string; application_id: string | null; external_team_id: string | null }> }
      : await supabase
          .from("tournament_group_members")
          .select("group_id, application_id, external_team_id")
          .in("group_id", groupIds);

  const groupByExternalTeamId = new Map<string, { groupId: string; groupName: string }>();
  for (const member of membersResult.data ?? []) {
    if (!member.external_team_id) {
      continue;
    }
    const group = (groupsResult.data ?? []).find((entry) => entry.id === member.group_id);
    if (group) {
      groupByExternalTeamId.set(String(member.external_team_id), {
        groupId: String(group.id),
        groupName: String(group.name),
      });
    }
  }

  return mergeTournamentParticipants({
    applications: roster.map((row) => ({
      id: String(row.application_id),
      clubName: String(row.club_name ?? "Verein"),
      teamName: String(row.team_name ?? "Mannschaft"),
      ageGroup: row.age_group ? String(row.age_group) : null,
      birthYear: row.birth_year ?? null,
      groupId: row.group_id ? String(row.group_id) : null,
      groupName: row.group_name ? String(row.group_name) : null,
    })),
    externalTeams: (externalResult.data ?? []).map((row) => {
      const group = groupByExternalTeamId.get(String(row.id));
      return {
        id: String(row.id),
        externalSource: String(row.external_source ?? "mein-turnierplan"),
        name: String(row.name),
        clubName: row.club_name ? String(row.club_name) : null,
        teamName: row.team_name ? String(row.team_name) : null,
        applicationId: row.application_id ? String(row.application_id) : null,
        participationStatus: String(row.participation_status ?? "detected"),
        externalActive: row.external_active !== false,
        ageGroup: row.age_group ? String(row.age_group) : null,
        birthYear: row.birth_year ?? null,
        groupId: group?.groupId ?? null,
        groupName: group?.groupName ?? null,
      };
    }),
  });
}
