"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import {
  canConfirmExternalTeams,
  countConfirmedParticipants,
  type ExternalTeamParticipationStatus,
} from "@/lib/mein-turnierplan-participants";

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { error: "Kein Adminzugang." as string };
  }
  return { error: null };
}

async function loadTournamentMeta(tournamentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, slug, max_teams")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return { tournament: null, error: "Das Turnier wurde nicht gefunden." };
  }

  return { tournament: data, error: null };
}

async function loadParticipantContext(tournamentId: string) {
  const supabase = await createClient();
  const [applicationsResult, externalResult] = await Promise.all([
    supabase
      .from("applications")
      .select("id, status")
      .eq("tournament_id", tournamentId)
      .eq("status", "accepted"),
    supabase
      .from("tournament_external_teams")
      .select("id, name, application_id, participation_status, external_active, external_id")
      .eq("tournament_id", tournamentId),
  ]);

  const acceptedApplicationIds = (applicationsResult.data ?? []).map((row) => String(row.id));
  const externalTeams = (externalResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    externalId: String(row.external_id),
    applicationId: row.application_id ? String(row.application_id) : null,
    participationStatus: String(row.participation_status ?? "detected"),
    externalActive: row.external_active !== false,
  }));

  return { acceptedApplicationIds, externalTeams };
}

function revalidateTournamentPaths(slug: string, tournamentId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${tournamentId}`);
  revalidatePath(`/admin/turniere/${tournamentId}/gruppen`);
  revalidatePath(`/turniere/${slug}`);
  revalidatePath("/turniere");
}

export type ExternalTeamAdminRow = {
  id: string;
  externalId: string;
  name: string;
  applicationId: string | null;
  participationStatus: ExternalTeamParticipationStatus;
  externalActive: boolean;
  groupName: string | null;
};

export async function listExternalTeamsForTournamentAction(tournamentId: string): Promise<{
  error: string | null;
  teams: ExternalTeamAdminRow[];
}> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, teams: [] };
  }

  const supabase = await createClient();
  const { data: teams, error } = await supabase
    .from("tournament_external_teams")
    .select("id, external_id, name, application_id, participation_status, external_active")
    .eq("tournament_id", tournamentId)
    .order("name", { ascending: true });

  if (error) {
    return { error: "Externe Teams konnten nicht geladen werden.", teams: [] };
  }

  const teamIds = (teams ?? []).map((team) => String(team.id));
  const membersResult =
    teamIds.length === 0
      ? { data: [] as Array<{ external_team_id: string | null; group_id: string }> }
      : await supabase
          .from("tournament_group_members")
          .select("external_team_id, group_id")
          .in("external_team_id", teamIds);

  const groupIds = Array.from(
    new Set(
      (membersResult.data ?? [])
        .map((row) => row.group_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const groupsResult =
    groupIds.length === 0
      ? { data: [] as Array<{ id: string; name: string }> }
      : await supabase.from("tournament_groups").select("id, name").in("id", groupIds);

  const groupNameById = new Map(
    (groupsResult.data ?? []).map((group) => [String(group.id), String(group.name)]),
  );
  const groupNameByTeamId = new Map<string, string>();
  for (const member of membersResult.data ?? []) {
    if (!member.external_team_id) {
      continue;
    }
    const groupName = groupNameById.get(String(member.group_id));
    if (groupName) {
      groupNameByTeamId.set(String(member.external_team_id), groupName);
    }
  }

  return {
    error: null,
    teams: (teams ?? []).map((team) => ({
      id: String(team.id),
      externalId: String(team.external_id),
      name: String(team.name),
      applicationId: team.application_id ? String(team.application_id) : null,
      participationStatus: (team.participation_status ??
        "detected") as ExternalTeamParticipationStatus,
      externalActive: team.external_active !== false,
      groupName: groupNameByTeamId.get(String(team.id)) ?? null,
    })),
  };
}

async function setParticipationStatus(input: {
  tournamentId: string;
  teamIds: string[];
  status: ExternalTeamParticipationStatus;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournamentMeta(input.tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  if (input.teamIds.length === 0) {
    return { error: "Keine Teams ausgewählt.", notice: null };
  }

  const context = await loadParticipantContext(input.tournamentId);
  const selected = context.externalTeams.filter((team) => input.teamIds.includes(team.id));

  if (selected.length === 0) {
    return { error: "Die ausgewählten Teams wurden nicht gefunden.", notice: null };
  }

  if (input.status === "confirmed") {
    const currentConfirmed = countConfirmedParticipants({
      acceptedApplicationIds: context.acceptedApplicationIds,
      externalTeams: context.externalTeams,
    });
    const gate = canConfirmExternalTeams({
      maxTeams: loaded.tournament.max_teams,
      currentConfirmedCount: currentConfirmed,
      acceptedApplicationIds: context.acceptedApplicationIds,
      teamsToConfirm: selected,
    });

    if (!gate.ok) {
      return { error: gate.error, notice: null };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_external_teams")
    .update({
      participation_status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq("tournament_id", input.tournamentId)
    .in("id", selected.map((team) => team.id));

  if (error) {
    return { error: "Der Teilnahmestatus konnte nicht gespeichert werden.", notice: null };
  }

  revalidateTournamentPaths(loaded.tournament.slug, loaded.tournament.id);

  const label =
    input.status === "confirmed"
      ? "bestätigt"
      : input.status === "rejected"
        ? "abgelehnt"
        : "zurückgesetzt";

  return {
    error: null,
    notice: `${selected.length} MeinTurnierplan-Team${selected.length === 1 ? "" : "s"} ${label}.`,
  };
}

export async function confirmExternalTeamsAction(input: {
  tournamentId: string;
  teamIds: string[];
}) {
  return setParticipationStatus({
    tournamentId: input.tournamentId,
    teamIds: input.teamIds,
    status: "confirmed",
  });
}

export async function rejectExternalTeamsAction(input: {
  tournamentId: string;
  teamIds: string[];
}) {
  return setParticipationStatus({
    tournamentId: input.tournamentId,
    teamIds: input.teamIds,
    status: "rejected",
  });
}

export async function confirmAllDetectedExternalTeamsAction(tournamentId: string) {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const context = await loadParticipantContext(tournamentId);
  const detectedIds = context.externalTeams
    .filter((team) => team.participationStatus === "detected" && team.externalActive)
    .map((team) => team.id);

  if (detectedIds.length === 0) {
    return { error: null, notice: "Keine offenen MeinTurnierplan-Teams zum Bestätigen." };
  }

  return confirmExternalTeamsAction({ tournamentId, teamIds: detectedIds });
}
