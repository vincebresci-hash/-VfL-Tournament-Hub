"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import {
  canConfirmExternalTeams,
  countConfirmedParticipants,
} from "@/lib/mein-turnierplan-participants";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import type { TournamentParticipant } from "@/lib/tournament-participants";

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

function revalidateTournamentPaths(slug: string, tournamentId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${tournamentId}`);
  revalidatePath(`/admin/turniere/${tournamentId}/gruppen`);
  revalidatePath(`/turniere/${slug}`);
  revalidatePath("/turniere");
}

async function assertCapacityForNewManualTeam(tournamentId: string, maxTeams: number | null) {
  const supabase = await createClient();
  const [applicationsResult, externalResult] = await Promise.all([
    supabase
      .from("applications")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("status", "accepted"),
    supabase
      .from("tournament_external_teams")
      .select("application_id, participation_status, external_active")
      .eq("tournament_id", tournamentId),
  ]);

  const current = countConfirmedParticipants({
    acceptedApplicationIds: (applicationsResult.data ?? []).map((row) => String(row.id)),
    externalTeams: (externalResult.data ?? []).map((row) => ({
      participationStatus: String(row.participation_status ?? "detected"),
      externalActive: row.external_active !== false,
      applicationId: row.application_id ? String(row.application_id) : null,
    })),
  });

  const gate = canConfirmExternalTeams({
    maxTeams,
    currentConfirmedCount: current,
    acceptedApplicationIds: (applicationsResult.data ?? []).map((row) => String(row.id)),
    teamsToConfirm: [
      {
        participationStatus: "detected",
        externalActive: true,
        applicationId: null,
      },
    ],
  });

  if (!gate.ok) {
    return gate.error ?? "Kapazität überschritten.";
  }

  return null;
}

async function syncExternalTeamGroupMembership(
  tournamentId: string,
  externalTeamId: string,
  groupId: string | null,
) {
  const supabase = await createClient();

  await supabase
    .from("tournament_group_members")
    .delete()
    .eq("external_team_id", externalTeamId);

  if (!groupId) {
    return null;
  }

  const groupResult = await supabase
    .from("tournament_groups")
    .select("id")
    .eq("id", groupId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (!groupResult.data) {
    return "Die gewählte Gruppe wurde nicht gefunden.";
  }

  const { error } = await supabase.from("tournament_group_members").insert({
    group_id: groupId,
    application_id: null,
    external_team_id: externalTeamId,
  });

  if (error) {
    return "Die Gruppenzuordnung konnte nicht gespeichert werden.";
  }

  return null;
}

export async function getTournamentParticipantsAction(
  tournamentId: string,
): Promise<{ error: string | null; participants: TournamentParticipant[] }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, participants: [] };
  }

  const participants = await getTournamentParticipants(tournamentId);
  return { error: null, participants };
}

export async function addManualTournamentParticipantAction(input: {
  tournamentId: string;
  clubName: string;
  teamName: string;
  ageGroup?: string | null;
  birthYear?: number | null;
  groupId?: string | null;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournamentMeta(input.tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  const clubName = input.clubName.trim();
  const teamName = input.teamName.trim();
  if (!clubName || !teamName) {
    return { error: "Vereinsname und Teamname sind erforderlich.", notice: null };
  }

  const capacityError = await assertCapacityForNewManualTeam(
    input.tournamentId,
    loaded.tournament.max_teams,
  );
  if (capacityError) {
    return { error: capacityError, notice: null };
  }

  const supabase = await createClient();
  const externalId = randomUUID();
  const displayName = `${clubName} · ${teamName}`;

  const { data, error } = await supabase
    .from("tournament_external_teams")
    .insert({
      tournament_id: input.tournamentId,
      external_source: "manual",
      external_id: externalId,
      name: displayName,
      club_name: clubName,
      team_name: teamName,
      age_group: input.ageGroup?.trim() || null,
      birth_year: input.birthYear ?? null,
      participation_status: "confirmed",
      external_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Das manuelle Team konnte nicht angelegt werden.", notice: null };
  }

  const groupError = await syncExternalTeamGroupMembership(
    input.tournamentId,
    String(data.id),
    input.groupId ?? null,
  );
  if (groupError) {
    return { error: groupError, notice: null };
  }

  revalidateTournamentPaths(loaded.tournament.slug, loaded.tournament.id);
  return { error: null, notice: `Teilnehmer „${displayName}“ wurde hinzugefügt.` };
}

export async function updateManualTournamentParticipantAction(input: {
  tournamentId: string;
  externalTeamId: string;
  clubName: string;
  teamName: string;
  ageGroup?: string | null;
  birthYear?: number | null;
  groupId?: string | null;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournamentMeta(input.tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  const clubName = input.clubName.trim();
  const teamName = input.teamName.trim();
  if (!clubName || !teamName) {
    return { error: "Vereinsname und Teamname sind erforderlich.", notice: null };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("tournament_external_teams")
    .select("id, external_source")
    .eq("id", input.externalTeamId)
    .eq("tournament_id", input.tournamentId)
    .maybeSingle();

  if (!existing || existing.external_source !== "manual") {
    return { error: "Nur manuelle Teilnehmer können hier bearbeitet werden.", notice: null };
  }

  const { error } = await supabase
    .from("tournament_external_teams")
    .update({
      club_name: clubName,
      team_name: teamName,
      name: `${clubName} · ${teamName}`,
      age_group: input.ageGroup?.trim() || null,
      birth_year: input.birthYear ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.externalTeamId);

  if (error) {
    return { error: "Der Teilnehmer konnte nicht aktualisiert werden.", notice: null };
  }

  const groupError = await syncExternalTeamGroupMembership(
    input.tournamentId,
    input.externalTeamId,
    input.groupId ?? null,
  );
  if (groupError) {
    return { error: groupError, notice: null };
  }

  revalidateTournamentPaths(loaded.tournament.slug, loaded.tournament.id);
  return { error: null, notice: "Manueller Teilnehmer wurde aktualisiert." };
}

export async function deactivateManualTournamentParticipantAction(input: {
  tournamentId: string;
  externalTeamId: string;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournamentMeta(input.tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("tournament_external_teams")
    .select("id, external_source")
    .eq("id", input.externalTeamId)
    .eq("tournament_id", input.tournamentId)
    .maybeSingle();

  if (!existing || existing.external_source !== "manual") {
    return { error: "Nur manuelle Teilnehmer können hier deaktiviert werden.", notice: null };
  }

  const { error } = await supabase
    .from("tournament_external_teams")
    .update({
      external_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.externalTeamId);

  if (error) {
    return { error: "Der Teilnehmer konnte nicht deaktiviert werden.", notice: null };
  }

  revalidateTournamentPaths(loaded.tournament.slug, loaded.tournament.id);
  return { error: null, notice: "Manueller Teilnehmer wurde deaktiviert." };
}
