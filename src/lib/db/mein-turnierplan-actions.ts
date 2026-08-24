"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { listAdminApplications } from "@/lib/db/queries";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { createTournamentGroupAction, assignTeamToGroupAction } from "@/lib/db/schedule-actions";
import {
  fetchMeinTurnierplanJson,
  meinTurnierplanConnectionMessage,
  parseMeinTurnierplanPreview,
  type MeinTurnierplanPreview,
} from "@/lib/mein-turnierplan-api";
import {
  buildImportGroupsFromPreview,
  type MeinTurnierplanImportGroup,
} from "@/lib/mein-turnierplan-import";
import { applicationBelongsToTournament } from "@/lib/tournaments";
import { validateMeinTurnierplanTournamentId } from "@/lib/mein-turnierplan";
import type { AdminTournamentRecord } from "@/types/admin";

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { session: null, error: "Kein Adminzugang." };
  }

  return { session, error: null };
}

async function loadTournament(tournamentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, slug")
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return { tournament: null, error: "Das Turnier wurde nicht gefunden." };
  }

  return { tournament: data, error: null };
}

function revalidateTournament(slug: string) {
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${slug}`);
  revalidatePath(`/turniere/${slug}`);
}

async function acceptedTeamsForTournament(tournament: Pick<AdminTournamentRecord, "id" | "slug">) {
  const result = await listAdminApplications();
  return result.applications
    .filter(
      (application) =>
        applicationBelongsToTournament(application, tournament) &&
        application.applicationStatus === "accepted",
    )
    .map((application) => ({
      applicationId: application.id,
      clubName: application.clubName,
      teamName: application.teamName,
    }));
}

export async function checkMeinTurnierplanConnectionAction(
  mtpTournamentId: string,
): Promise<{ error: string | null; ok: boolean }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, ok: false };
  }

  const idValidation = validateMeinTurnierplanTournamentId(mtpTournamentId);
  if (idValidation.error || !idValidation.value) {
    return { error: idValidation.error, ok: false };
  }

  const result = await fetchMeinTurnierplanJson(idValidation.value);
  if (!result.ok) {
    return { error: meinTurnierplanConnectionMessage(result.error), ok: false };
  }

  return { error: null, ok: true };
}

export async function loadMeinTurnierplanPreviewAction(
  mtpTournamentId: string,
): Promise<{
  error: string | null;
  preview: MeinTurnierplanPreview | null;
  mappingGroups: MeinTurnierplanImportGroup[] | null;
}> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, preview: null, mappingGroups: null };
  }

  const idValidation = validateMeinTurnierplanTournamentId(mtpTournamentId);
  if (idValidation.error || !idValidation.value) {
    return { error: idValidation.error, preview: null, mappingGroups: null };
  }

  const result = await fetchMeinTurnierplanJson(idValidation.value);
  if (!result.ok) {
    return {
      error: meinTurnierplanConnectionMessage(result.error),
      preview: null,
      mappingGroups: null,
    };
  }

  const preview = parseMeinTurnierplanPreview(result.data);
  return {
    error: null,
    preview,
    mappingGroups: null,
  };
}

export async function loadMeinTurnierplanPreviewForTournamentAction(
  tournamentId: string,
  mtpTournamentId: string,
): Promise<{
  error: string | null;
  preview: MeinTurnierplanPreview | null;
  mappingGroups: MeinTurnierplanImportGroup[] | null;
}> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, preview: null, mappingGroups: null };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, preview: null, mappingGroups: null };
  }

  const previewResult = await loadMeinTurnierplanPreviewAction(mtpTournamentId);
  if (previewResult.error || !previewResult.preview) {
    return previewResult;
  }

  const acceptedTeams = await acceptedTeamsForTournament(loaded.tournament);
  const mappingGroups = buildImportGroupsFromPreview(
    previewResult.preview.groups,
    acceptedTeams,
  );

  return {
    error: null,
    preview: previewResult.preview,
    mappingGroups,
  };
}

export async function importMeinTurnierplanGroupsAction(
  tournamentId: string,
  groups: MeinTurnierplanImportGroup[],
): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  if (stage.matches.length > 0) {
    return {
      error:
        "Import nicht möglich, solange ein Spielplan existiert. Bitte zuerst den Spielplan entfernen.",
      notice: null,
    };
  }

  const acceptedTeams = await acceptedTeamsForTournament(loaded.tournament);
  const acceptedIds = new Set(acceptedTeams.map((team) => team.applicationId));
  const usedApplicationIds = new Set<string>();

  let assignedCount = 0;
  let skippedCount = 0;

  for (const group of groups) {
    const trimmedName = group.name.trim();
    if (!trimmedName) {
      continue;
    }

    const existing = stage.groups.find(
      (entry) => entry.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );
    let groupId = existing?.id ?? null;

    if (!groupId) {
      const created = await createTournamentGroupAction(tournamentId, trimmedName);
      if (created.error) {
        return { error: created.error, notice: null };
      }

      const refreshed = await getAdminTournamentStage(tournamentId);
      groupId =
        refreshed.groups.find(
          (entry) => entry.name.trim().toLowerCase() === trimmedName.toLowerCase(),
        )?.id ?? null;
    }

    if (!groupId) {
      return { error: "Die Gruppe konnte nach dem Import nicht gefunden werden.", notice: null };
    }

    for (const assignment of group.assignments) {
      const applicationId = assignment.applicationId?.trim() ?? "";
      if (!applicationId) {
        skippedCount += 1;
        continue;
      }

      if (!acceptedIds.has(applicationId) || usedApplicationIds.has(applicationId)) {
        skippedCount += 1;
        continue;
      }

      const assignResult = await assignTeamToGroupAction(
        tournamentId,
        applicationId,
        groupId,
      );
      if (assignResult.error) {
        return { error: assignResult.error, notice: null };
      }

      usedApplicationIds.add(applicationId);
      assignedCount += 1;
    }
  }

  revalidateTournament(loaded.tournament.slug);

  return {
    error: null,
    notice:
      assignedCount > 0
        ? `${assignedCount} Team(s) in Gruppen übernommen.${skippedCount > 0 ? ` ${skippedCount} ohne Zuordnung übersprungen.` : ""}`
        : "Es wurden keine Teams übernommen. Bitte Zuordnungen prüfen.",
  };
}
