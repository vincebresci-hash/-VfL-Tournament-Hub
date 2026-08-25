import { createClient } from "@/lib/supabase/server";
import {
  mergeTournamentParticipants,
  type TournamentParticipant,
} from "@/lib/tournament-participants";
import type { TournamentPublicRosterRow } from "@/lib/supabase/database";

async function loadClubLogoMap(clubIds: string[]) {
  const unique = [...new Set(clubIds.filter(Boolean))];
  if (unique.length === 0) {
    return new Map<string, string | null>();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("club_logo_urls", {
    p_club_ids: unique,
  });

  if (!error && data) {
    return new Map(
      (data as Array<{ id: string; logo_url: string | null }>).map((row) => [
        String(row.id),
        row.logo_url ? String(row.logo_url) : null,
      ]),
    );
  }

  // Fallback for environments where the helper RPC is not yet applied (admin can read clubs).
  const clubsResult = await supabase.from("clubs").select("id, logo_url").in("id", unique);
  return new Map(
    (clubsResult.data ?? []).map((row) => [
      String(row.id),
      row.logo_url ? String(row.logo_url) : null,
    ]),
  );
}

export async function getTournamentParticipants(
  tournamentId: string,
): Promise<TournamentParticipant[]> {
  const supabase = await createClient();

  const [applicationsResult, externalResult, groupsResult] = await Promise.all([
    supabase
      .from("applications")
      .select("id, club_name, team_name, age_group, birth_year, status, club_id")
      .eq("tournament_id", tournamentId)
      .eq("status", "accepted"),
    supabase
      .from("tournament_external_teams")
      .select(
        "id, external_source, external_id, name, club_name, team_name, application_id, participation_status, external_active, age_group, birth_year, logo_url, club_id",
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

  const clubIds = [
    ...(applicationsResult.data ?? []).map((row) =>
      row.club_id ? String(row.club_id) : "",
    ),
    ...(externalResult.data ?? []).map((row) => (row.club_id ? String(row.club_id) : "")),
  ].filter(Boolean);

  const clubLogos = await loadClubLogoMap(clubIds);

  return mergeTournamentParticipants({
    applications: (applicationsResult.data ?? []).map((row) => {
      const group = groupByApplicationId.get(String(row.id));
      const clubId = row.club_id ? String(row.club_id) : null;
      return {
        id: String(row.id),
        clubName: String(row.club_name ?? "Verein"),
        teamName: String(row.team_name ?? "Mannschaft"),
        ageGroup: row.age_group ? String(row.age_group) : null,
        birthYear: row.birth_year ?? null,
        groupId: group?.groupId ?? null,
        groupName: group?.groupName ?? null,
        clubLogoUrl: clubId ? (clubLogos.get(clubId) ?? null) : null,
        clubId,
      };
    }),
    externalTeams: (externalResult.data ?? []).map((row) => {
      const group = groupByExternalTeamId.get(String(row.id));
      const clubId = row.club_id ? String(row.club_id) : null;
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
        clubId,
        logoUrl: row.logo_url ? String(row.logo_url) : null,
        hubClubLogoUrl: clubId ? (clubLogos.get(clubId) ?? null) : null,
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
      "id, external_source, external_id, name, club_name, team_name, application_id, participation_status, external_active, age_group, birth_year, logo_url, club_id",
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

  const externalClubIds = (externalResult.data ?? [])
    .map((row) => (row.club_id ? String(row.club_id) : ""))
    .filter(Boolean);
  const clubLogos = await loadClubLogoMap(externalClubIds);

  return mergeTournamentParticipants({
    applications: roster.map((row) => ({
      id: String(row.application_id),
      clubName: String(row.club_name ?? "Verein"),
      teamName: String(row.team_name ?? "Mannschaft"),
      ageGroup: row.age_group ? String(row.age_group) : null,
      birthYear: row.birth_year ?? null,
      groupId: row.group_id ? String(row.group_id) : null,
      groupName: row.group_name ? String(row.group_name) : null,
      clubId: row.club_id ? String(row.club_id) : null,
      clubLogoUrl: row.logo_url ? String(row.logo_url) : null,
    })),
    externalTeams: (externalResult.data ?? []).map((row) => {
      const group = groupByExternalTeamId.get(String(row.id));
      const clubId = row.club_id ? String(row.club_id) : null;
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
        clubId,
        logoUrl: row.logo_url ? String(row.logo_url) : null,
        hubClubLogoUrl: clubId ? (clubLogos.get(clubId) ?? null) : null,
      };
    }),
  });
}
