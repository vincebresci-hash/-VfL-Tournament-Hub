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
import {
  buildApplyLogoUrlOnlyState,
  buildClearCustomLogoState,
  buildUnlinkHubClubState,
  selectTeamsForLogoApply,
} from "@/lib/tournament-participant-logos";
import {
  buildExternalTeamLogoObjectPath,
  deleteManagedClubLogoIfOwned,
  isAllowedClubLogoMimeType,
  uploadClubLogoFile,
} from "@/lib/storage/club-logos";

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
  clubId?: string | null;
  logoUrl?: string | null;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournamentMeta(input.tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  let clubName = input.clubName.trim();
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
  const clubId = input.clubId?.trim() || null;
  const logoUrl = input.logoUrl?.trim() || null;

  if (clubId) {
    const { data: club } = await supabase
      .from("clubs")
      .select("id, name, logo_url")
      .eq("id", clubId)
      .maybeSingle();

    if (!club) {
      return { error: "Der gewählte Hub-Verein wurde nicht gefunden.", notice: null };
    }

    if (!input.clubName.trim()) {
      clubName = String(club.name);
    }
  }

  if (logoUrl && !(logoUrl.startsWith("https://") || logoUrl.startsWith("http://") || logoUrl.startsWith("/"))) {
    return { error: "Die Logo-URL ist ungültig.", notice: null };
  }

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
      club_id: clubId,
      logo_url: logoUrl,
      logo_manual_override: Boolean(logoUrl || clubId),
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
  clubId?: string | null;
  logoUrl?: string | null;
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

  const clubId = input.clubId?.trim() || null;
  const logoUrl = input.logoUrl?.trim() || null;

  if (clubId) {
    const { data: club } = await supabase
      .from("clubs")
      .select("id")
      .eq("id", clubId)
      .maybeSingle();
    if (!club) {
      return { error: "Der gewählte Hub-Verein wurde nicht gefunden.", notice: null };
    }
  }

  if (logoUrl && !(logoUrl.startsWith("https://") || logoUrl.startsWith("http://") || logoUrl.startsWith("/"))) {
    return { error: "Die Logo-URL ist ungültig.", notice: null };
  }

  const { error } = await supabase
    .from("tournament_external_teams")
    .update({
      club_name: clubName,
      team_name: teamName,
      name: `${clubName} · ${teamName}`,
      age_group: input.ageGroup?.trim() || null,
      birth_year: input.birthYear ?? null,
      club_id: clubId,
      logo_url: logoUrl,
      logo_manual_override: Boolean(logoUrl || clubId),
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

async function loadExternalTeamForLogoEdit(tournamentId: string, externalTeamId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_external_teams")
    .select(
      "id, tournament_id, external_source, name, club_name, team_name, club_id, logo_url, logo_manual_override, participation_status, external_active",
    )
    .eq("id", externalTeamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return { team: null, error: "Das Team wurde nicht gefunden." };
  }

  return { team: data, error: null };
}

export async function updateExternalTeamLogoAction(input: {
  tournamentId: string;
  externalTeamId: string;
  mode: "hub-club" | "unlink-hub" | "upload" | "url" | "remove";
  clubId?: string | null;
  logoUrl?: string | null;
  logoFile?: File | null;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournamentMeta(input.tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  const existing = await loadExternalTeamForLogoEdit(input.tournamentId, input.externalTeamId);
  if (!existing.team) {
    return { error: existing.error, notice: null };
  }

  const supabase = await createClient();
  const currentClubId = existing.team.club_id ? String(existing.team.club_id) : null;
  const currentLogoUrl = existing.team.logo_url ? String(existing.team.logo_url) : null;
  const previousLogoUrl = currentLogoUrl;

  let patch: {
    club_id?: string | null;
    logo_url?: string | null;
    logo_manual_override: true;
    updated_at: string;
  } = {
    logo_manual_override: true,
    updated_at: new Date().toISOString(),
  };
  let notice = "Logo wurde gespeichert.";

  if (input.mode === "remove") {
    const state = buildClearCustomLogoState(currentClubId);
    patch = {
      ...patch,
      logo_url: state.logoUrl,
    };
    notice =
      currentClubId
        ? "Eigenes Logo entfernt. Falls der Hub-Verein ein Logo hat, wird dieses weiterhin angezeigt."
        : "Logo wurde entfernt.";
  } else if (input.mode === "unlink-hub") {
    const state = buildUnlinkHubClubState(currentLogoUrl);
    patch = {
      ...patch,
      club_id: state.clubId,
    };
    notice = "Hub-Verein-Verknüpfung entfernt.";
  } else if (input.mode === "hub-club") {
    const clubId = input.clubId?.trim() || null;
    if (!clubId) {
      return { error: "Bitte einen Hub-Verein auswählen.", notice: null };
    }

    const { data: club } = await supabase
      .from("clubs")
      .select("id, logo_url")
      .eq("id", clubId)
      .maybeSingle();

    if (!club) {
      return { error: "Der gewählte Hub-Verein wurde nicht gefunden.", notice: null };
    }

    patch = {
      ...patch,
      club_id: clubId,
    };
    notice = "Hub-Verein verknüpft.";
  } else if (input.mode === "upload") {
    const logoFile = input.logoFile;
    if (!logoFile || !(logoFile instanceof File) || logoFile.size <= 0) {
      return { error: "Bitte eine Bilddatei auswählen.", notice: null };
    }

    if (!isAllowedClubLogoMimeType(logoFile.type)) {
      return { error: "Erlaubt sind PNG, JPEG oder WebP.", notice: null };
    }

    const uploaded = await uploadClubLogoFile({
      supabase,
      file: logoFile,
      objectPath: buildExternalTeamLogoObjectPath({
        tournamentId: input.tournamentId,
        externalTeamId: input.externalTeamId,
        mimeType: logoFile.type,
      }),
    });

    if (uploaded.error || !uploaded.publicUrl) {
      return { error: uploaded.error ?? "Upload fehlgeschlagen.", notice: null };
    }

    // Store logo_url only — never invent/require a Hub club.
    patch = {
      ...patch,
      logo_url: uploaded.publicUrl,
    };
    notice = "Logo wurde hochgeladen.";
  } else {
    const logoUrl = input.logoUrl?.trim() || null;
    if (!logoUrl) {
      return { error: "Bitte eine Logo-URL angeben.", notice: null };
    }
    if (!(logoUrl.startsWith("https://") || logoUrl.startsWith("http://") || logoUrl.startsWith("/"))) {
      return { error: "Die Logo-URL ist ungültig.", notice: null };
    }

    patch = {
      ...patch,
      logo_url: logoUrl,
    };
    notice = "Logo-URL wurde gespeichert.";
  }

  const { error } = await supabase
    .from("tournament_external_teams")
    .update(patch)
    .eq("id", input.externalTeamId)
    .eq("tournament_id", input.tournamentId);

  if (error) {
    return { error: "Das Logo konnte nicht gespeichert werden.", notice: null };
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "logo_url") &&
    previousLogoUrl &&
    previousLogoUrl !== patch.logo_url
  ) {
    await deleteManagedClubLogoIfOwned({ supabase, logoUrl: previousLogoUrl });
  }

  revalidateTournamentPaths(loaded.tournament.slug, loaded.tournament.id);
  return { error: null, notice };
}

/**
 * Reliable file upload via FormData (File arguments are flaky across clients).
 * Does not require or set club_id.
 */
export async function uploadExternalTeamLogoFormAction(
  formData: FormData,
): Promise<{ error: string | null; notice: string | null }> {
  const tournamentId = String(formData.get("tournamentId") ?? "").trim();
  const externalTeamId = String(formData.get("externalTeamId") ?? "").trim();
  const logoFile = formData.get("logoFile");

  if (!tournamentId || !externalTeamId) {
    return { error: "Turnier oder Team fehlt.", notice: null };
  }

  if (!(logoFile instanceof File)) {
    return { error: "Bitte eine Bilddatei auswählen.", notice: null };
  }

  return updateExternalTeamLogoAction({
    tournamentId,
    externalTeamId,
    mode: "upload",
    logoFile,
  });
}

export async function applyExternalTeamLogoToSelectedTeamsAction(input: {
  tournamentId: string;
  sourceExternalTeamId: string;
  selectedExternalTeamIds: string[];
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
  const { data: teams, error: teamsError } = await supabase
    .from("tournament_external_teams")
    .select("id, club_id, logo_url, logo_manual_override")
    .eq("tournament_id", input.tournamentId);

  if (teamsError || !teams) {
    return { error: "Die Teams konnten nicht geladen werden.", notice: null };
  }

  const source = teams.find((team) => String(team.id) === input.sourceExternalTeamId);
  if (!source) {
    return { error: "Das Quell-Team wurde nicht gefunden.", notice: null };
  }

  const selection = selectTeamsForLogoApply({
    sourceTeamId: input.sourceExternalTeamId,
    selectedTeamIds: input.selectedExternalTeamIds,
    availableTeamIds: teams.map((team) => String(team.id)),
  });

  if (selection.error) {
    return { error: selection.error, notice: null };
  }

  const logoOnly = buildApplyLogoUrlOnlyState(
    source.logo_url ? String(source.logo_url) : null,
  );
  if (logoOnly.error || !logoOnly.logoUrl) {
    return {
      error: logoOnly.error ?? "Das Quell-Team hat kein eigenes Logo zum Übernehmen.",
      notice: null,
    };
  }

  const { error } = await supabase
    .from("tournament_external_teams")
    .update({
      logo_url: logoOnly.logoUrl,
      logo_manual_override: true,
      updated_at: new Date().toISOString(),
    })
    .eq("tournament_id", input.tournamentId)
    .in("id", selection.targetIds);

  if (error) {
    return { error: "Das Logo konnte nicht auf die ausgewählten Teams übernommen werden.", notice: null };
  }

  revalidateTournamentPaths(loaded.tournament.slug, loaded.tournament.id);
  return {
    error: null,
    notice: `Logo auf ${selection.targetIds.length} Team(s) übernommen.`,
  };
}
