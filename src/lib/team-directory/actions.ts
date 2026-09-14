"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/db/errors";
import { requireTeamsManage, requireTeamsView } from "@/lib/rbac/action-access";
import { hasAnyPlatformPermission } from "@/lib/rbac/permissions";
import { requireAdminSession } from "@/lib/auth/guards";
import {
  findActiveTeamDirectoryEntryBySourceApplication,
  findTeamDirectoryDuplicates,
  getTeamDirectoryEntry,
  loadApplicationForTeamDirectory,
} from "@/lib/team-directory/queries";
import {
  buildDirectoryNormalization,
  cleanOptionalText,
} from "@/lib/team-directory/normalize";
import { toTeamDirectoryEntry } from "@/lib/team-directory/mappers";
import {
  buildTeamDirectoryLogoObjectPath,
  deleteManagedClubLogoIfOwned,
  getFormDataUploadFile,
  resolveClubLogoMimeType,
  teamDirectoryLogoPathPrefix,
  uploadClubLogoFile,
} from "@/lib/storage/club-logos";
import type { TeamDirectorySaveInput } from "@/types/team-directory";

async function requirePlatformTeamsManage() {
  const access = await requireTeamsManage();
  if (access.error || !access.session) {
    return access;
  }

  const adminAccess = await requireAdminSession();
  if ("error" in adminAccess && adminAccess.error) {
    return { session: access.session, error: adminAccess.error };
  }

  if (
    adminAccess.authorization &&
    !hasAnyPlatformPermission(adminAccess.authorization.roleKeys) &&
    adminAccess.session.user.role !== "super-admin" &&
    adminAccess.session.user.role !== "admin"
  ) {
    return {
      session: access.session,
      error: "Nur Plattform-Admins dürfen die Team-Datenbank verwalten.",
    };
  }

  return access;
}

async function requirePlatformTeamsView() {
  const access = await requireTeamsView();
  if (access.error || !access.session) {
    return access;
  }

  const adminAccess = await requireAdminSession();
  if ("error" in adminAccess && adminAccess.error) {
    return { session: access.session, error: adminAccess.error };
  }

  if (
    adminAccess.authorization &&
    !hasAnyPlatformPermission(adminAccess.authorization.roleKeys) &&
    adminAccess.session.user.role !== "super-admin" &&
    adminAccess.session.user.role !== "admin"
  ) {
    return {
      session: access.session,
      error: "Nur Plattform-Admins dürfen die Team-Datenbank einsehen.",
    };
  }

  return access;
}

function buildEntryPayload(input: TeamDirectorySaveInput, actorId: string) {
  const clubName = input.clubName.trim();
  const teamName = input.teamName.trim();

  if (!clubName || !teamName) {
    throw new Error("Verein und Teamname sind erforderlich.");
  }

  const normalized = buildDirectoryNormalization({
    clubName,
    teamName,
    ageGroup: input.ageGroup,
    contactEmail: input.contactEmail,
  });

  return {
    club_name: clubName,
    team_name: teamName,
    age_group: cleanOptionalText(input.ageGroup),
    contact_first_name: cleanOptionalText(input.contactFirstName),
    contact_last_name: cleanOptionalText(input.contactLastName),
    contact_role: cleanOptionalText(input.contactRole),
    contact_email: cleanOptionalText(input.contactEmail),
    contact_phone: cleanOptionalText(input.contactPhone),
    website: cleanOptionalText(input.website),
    league: cleanOptionalText(input.league),
    birth_year: input.birthYear ?? null,
    division: cleanOptionalText(input.division),
    self_rated_strength: input.selfRatedStrength ?? null,
    internal_category: cleanOptionalText(input.internalCategory),
    internal_strength: input.internalStrength ?? null,
    internal_notes: cleanOptionalText(input.internalNotes),
    source: input.source ?? (input.sourceApplicationId ? "application" : "manual"),
    source_application_id: input.sourceApplicationId ?? null,
    club_id: input.clubId ?? null,
    team_id: input.teamId ?? null,
    norm_club_name: normalized.normClubName,
    norm_team_name: normalized.normTeamName,
    norm_age_group: normalized.normAgeGroup,
    norm_contact_email: normalized.normContactEmail,
    updated_by: actorId,
  };
}

export async function getTeamDirectorySavePreviewAction(applicationId: string) {
  const access = await requirePlatformTeamsView();
  if (access.error) {
    return { error: access.error };
  }

  const application = await loadApplicationForTeamDirectory(applicationId);
  if (!application) {
    return { error: "Bewerbung nicht gefunden." };
  }

  const suggested = {
    clubName: application.club_name?.trim() || "",
    teamName: application.team_name?.trim() || "",
    ageGroup: application.age_group,
    contactFirstName: application.contact_first_name,
    contactLastName: application.contact_last_name,
    contactRole: application.contact_role,
    contactEmail: application.contact_email,
    contactPhone: application.contact_phone,
    website: application.website,
    league: application.league,
    birthYear: application.birth_year,
    division: application.division,
    selfRatedStrength: application.self_rated_strength,
    internalNotes: application.notes,
    sourceApplicationId: application.id,
    clubId: application.club_id,
    teamId: application.team_id,
    source: "application" as const,
  };

  const duplicates = await findTeamDirectoryDuplicates({
    clubName: suggested.clubName,
    teamName: suggested.teamName,
    ageGroup: suggested.ageGroup,
    clubId: suggested.clubId,
    teamId: suggested.teamId,
    sourceApplicationId: application.id,
  });

  return { suggested, duplicates };
}

export async function saveTeamDirectoryEntryAction(input: TeamDirectorySaveInput) {
  const access = await requirePlatformTeamsManage();
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung." };
  }

  const duplicates = await findTeamDirectoryDuplicates({
    clubName: input.clubName,
    teamName: input.teamName,
    ageGroup: input.ageGroup,
    clubId: input.clubId,
    teamId: input.teamId,
    sourceApplicationId: input.sourceApplicationId,
  });

  const applicationDuplicate = duplicates.find(
    (duplicate) => duplicate.matchReason === "source_application",
  );
  if (applicationDuplicate) {
    return {
      error: "Diese Bewerbung wurde bereits in die Team-Datenbank übernommen.",
      duplicates,
    };
  }

  if (!input.forceCreate && duplicates.length > 0) {
    return {
      error: "Möglicherweise bereits vorhanden.",
      duplicates,
    };
  }

  const supabase = await createClient();
  const payload = buildEntryPayload(input, access.session.user.id);

  const { data, error } = await supabase
    .from("team_directory_entries")
    .insert({
      ...payload,
      created_by: access.session.user.id,
    })
    .select(
      "id, club_name, team_name, age_group, contact_first_name, contact_last_name, contact_role, contact_email, contact_phone, website, league, birth_year, division, self_rated_strength, internal_category, internal_strength, internal_notes, source, source_application_id, club_id, team_id, archived_at, created_at, updated_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      if (input.sourceApplicationId) {
        const existingFromApplication =
          await findActiveTeamDirectoryEntryBySourceApplication(input.sourceApplicationId);
        if (existingFromApplication) {
          return {
            error: "Diese Bewerbung wurde bereits in die Team-Datenbank übernommen.",
            duplicates: [existingFromApplication],
          };
        }
      }

      return { error: "Dieses Hub-Team ist bereits in der Team-Datenbank gespeichert." };
    }

    if (isMissingRelationError(error)) {
      return { error: "Team-Datenbank ist noch nicht migriert." };
    }

    return { error: "Team konnte nicht gespeichert werden." };
  }

  revalidatePath("/admin/team-datenbank");
  if (input.sourceApplicationId) {
    revalidatePath(`/admin/bewerbungen/${input.sourceApplicationId}`);
  }

  return { entry: toTeamDirectoryEntry(data) };
}

export async function updateTeamDirectoryEntryAction(
  entryId: string,
  input: TeamDirectorySaveInput,
) {
  const access = await requirePlatformTeamsManage();
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung." };
  }

  const existing = await getTeamDirectoryEntry(entryId);
  if (!existing) {
    return { error: "Team-Datensatz nicht gefunden." };
  }

  const duplicates = await findTeamDirectoryDuplicates({
    clubName: input.clubName,
    teamName: input.teamName,
    ageGroup: input.ageGroup,
    clubId: input.clubId ?? existing.clubId,
    teamId: input.teamId ?? existing.teamId,
    excludeId: entryId,
  });

  if (!input.forceCreate && duplicates.length > 0) {
    return {
      error: "Möglicherweise bereits vorhanden.",
      duplicates,
    };
  }

  const supabase = await createClient();
  const payload = buildEntryPayload(
    {
      ...input,
      clubId: input.clubId ?? existing.clubId,
      teamId: input.teamId ?? existing.teamId,
      sourceApplicationId: input.sourceApplicationId ?? existing.sourceApplicationId,
      source: input.source ?? existing.source,
    },
    access.session.user.id,
  );

  const { data, error } = await supabase
    .from("team_directory_entries")
    .update(payload)
    .eq("id", entryId)
    .select(
      "id, club_name, team_name, age_group, contact_first_name, contact_last_name, contact_role, contact_email, contact_phone, website, league, birth_year, division, self_rated_strength, internal_category, internal_strength, internal_notes, source, source_application_id, club_id, team_id, archived_at, created_at, updated_at",
    )
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Dieses Hub-Team ist bereits in der Team-Datenbank gespeichert." };
    }

    return { error: "Team konnte nicht aktualisiert werden." };
  }

  revalidatePath("/admin/team-datenbank");
  revalidatePath(`/admin/team-datenbank/${entryId}`);

  return { entry: toTeamDirectoryEntry(data) };
}

export async function setTeamDirectoryArchivedAction(entryId: string, archived: boolean) {
  const access = await requirePlatformTeamsManage();
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_directory_entries")
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      updated_by: access.session.user.id,
    })
    .eq("id", entryId);

  if (error) {
    return { error: "Archivstatus konnte nicht geändert werden." };
  }

  revalidatePath("/admin/team-datenbank");
  revalidatePath(`/admin/team-datenbank/${entryId}`);

  return { ok: true };
}

export async function updateTeamDirectoryLogoAction(input: {
  entryId: string;
  mode: "upload" | "url" | "remove";
  logoUrl?: string | null;
  logoFile?: File | null;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requirePlatformTeamsManage();
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung.", notice: null };
  }

  const entryId = input.entryId.trim();
  if (!entryId) {
    return { error: "Team-Eintrag fehlt.", notice: null };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("team_directory_entries")
    .select("id, logo_url")
    .eq("id", entryId)
    .maybeSingle();

  if (loadError || !existing) {
    return { error: "Team-Datenbank-Eintrag wurde nicht gefunden.", notice: null };
  }

  const previousLogoUrl = existing.logo_url ? String(existing.logo_url) : null;
  let nextLogoUrl: string | null = previousLogoUrl;
  let notice = "Logo wurde gespeichert.";
  const pathPrefix = teamDirectoryLogoPathPrefix(entryId);

  if (input.mode === "remove") {
    nextLogoUrl = null;
    notice = "Logo entfernt.";
  } else if (input.mode === "upload") {
    const logoFile = input.logoFile;
    if (
      !logoFile ||
      typeof logoFile !== "object" ||
      typeof logoFile.arrayBuffer !== "function" ||
      logoFile.size <= 0
    ) {
      return { error: "Bitte eine Bilddatei auswählen.", notice: null };
    }

    const mimeType = resolveClubLogoMimeType(logoFile);
    if (!mimeType) {
      return { error: "Erlaubt sind PNG, JPEG oder WebP.", notice: null };
    }

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return {
        error: "Keine gültige Admin-Session für den Upload. Bitte erneut anmelden.",
        notice: null,
      };
    }

    const objectPath = buildTeamDirectoryLogoObjectPath({
      entryId,
      mimeType,
    });

    const uploaded = await uploadClubLogoFile({
      supabase,
      file: logoFile,
      objectPath,
      mimeType,
    });

    if (uploaded.error || !uploaded.publicUrl) {
      return { error: uploaded.error ?? "Upload fehlgeschlagen.", notice: null };
    }

    nextLogoUrl = uploaded.publicUrl;
    notice = "Logo gespeichert.";
  } else {
    const logoUrl = input.logoUrl?.trim() || null;
    if (!logoUrl) {
      return { error: "Bitte eine Logo-URL angeben.", notice: null };
    }
    if (
      !(
        logoUrl.startsWith("https://") ||
        logoUrl.startsWith("http://") ||
        logoUrl.startsWith("/")
      )
    ) {
      return { error: "Die Logo-URL ist ungültig.", notice: null };
    }

    nextLogoUrl = logoUrl;
    notice = "Logo-URL wurde gespeichert.";
  }

  const { error } = await supabase
    .from("team_directory_entries")
    .update({
      logo_url: nextLogoUrl,
      updated_by: access.session.user.id,
    })
    .eq("id", entryId);

  if (error) {
    if (input.mode === "upload" && nextLogoUrl) {
      await deleteManagedClubLogoIfOwned({
        supabase,
        logoUrl: nextLogoUrl,
        requiredPathPrefix: pathPrefix,
      });
    }
    console.error("[team-directory] logo update failed", {
      entryId,
      message: error.message,
      code: error.code,
    });
    return {
      error: `Logo konnte nicht gespeichert werden: ${error.message.slice(0, 180)}`,
      notice: null,
    };
  }

  if (previousLogoUrl && previousLogoUrl !== nextLogoUrl) {
    await deleteManagedClubLogoIfOwned({
      supabase,
      logoUrl: previousLogoUrl,
      requiredPathPrefix: pathPrefix,
    });
  }

  revalidatePath("/admin/team-datenbank");
  revalidatePath(`/admin/team-datenbank/${entryId}`);
  return { error: null, notice };
}

export async function uploadTeamDirectoryLogoFormAction(
  formData: FormData,
): Promise<{ error: string | null; notice: string | null }> {
  const entryId = String(formData.get("entryId") ?? "").trim();
  const { file: logoFile, meta } = getFormDataUploadFile(formData, "logoFile");

  if (!entryId) {
    return { error: "Team-Eintrag fehlt.", notice: null };
  }

  if (!logoFile) {
    return {
      error: meta.received
        ? "Die hochgeladene Datei ist leer oder ungültig."
        : "Bitte eine Bilddatei auswählen.",
      notice: null,
    };
  }

  return updateTeamDirectoryLogoAction({
    entryId,
    mode: "upload",
    logoFile,
  });
}

/**
 * Hard-delete a Team-Datenbank CRM row only.
 * Does not delete applications, clubs, teams, tournaments, or match data.
 * communication_recipients.team_directory_entry_id becomes NULL via FK ON DELETE SET NULL.
 */
export async function deleteTeamDirectoryEntryAction(
  entryId: string,
): Promise<{ error: string | null; ok?: true }> {
  const access = await requirePlatformTeamsManage();
  if (access.error || !access.session) {
    return { error: access.error ?? "Keine Berechtigung." };
  }

  const id = entryId.trim();
  if (!id) {
    return { error: "Team-Eintrag fehlt." };
  }

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("team_directory_entries")
    .select("id, logo_url")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !existing) {
    return { error: "Team-Datenbank-Eintrag wurde nicht gefunden." };
  }

  const previousLogoUrl = existing.logo_url ? String(existing.logo_url) : null;
  const pathPrefix = teamDirectoryLogoPathPrefix(id);

  const { error: deleteError } = await supabase
    .from("team_directory_entries")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[team-directory] hard delete failed", {
      entryId: id,
      message: deleteError.message,
      code: deleteError.code,
    });
    return {
      error: `Eintrag konnte nicht gelöscht werden: ${deleteError.message.slice(0, 180)}`,
    };
  }

  if (previousLogoUrl) {
    await deleteManagedClubLogoIfOwned({
      supabase,
      logoUrl: previousLogoUrl,
      requiredPathPrefix: pathPrefix,
    });
  }

  revalidatePath("/admin/team-datenbank");
  revalidatePath(`/admin/team-datenbank/${id}`);
  return { ok: true, error: null };
}
