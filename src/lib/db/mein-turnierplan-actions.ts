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
import {
  resolveMeinTurnierplanJsonQueryId,
  validateMeinTurnierplanTournamentId,
} from "@/lib/mein-turnierplan";
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
    .select(
      "id, slug, mein_turnierplan_tournament_id, mein_turnierplan_matches_widget_url, mein_turnierplan_table_widget_url",
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return { tournament: null, error: "Das Turnier wurde nicht gefunden." };
  }

  return { tournament: data, error: null };
}

function resolveJsonQueryId(input: {
  mtpTournamentId?: string;
  matchesWidgetUrl?: string | null;
  tableWidgetUrl?: string | null;
}) {
  const trimmed = input.mtpTournamentId?.trim() ?? "";
  if (trimmed) {
    const validated = validateMeinTurnierplanTournamentId(trimmed, { required: true });
    if (validated.error || !validated.value) {
      return { error: validated.error, queryId: null, source: null as string | null };
    }

    return {
      error: null,
      queryId: validated.value,
      source: "tournament-id" as const,
    };
  }

  const resolved = resolveMeinTurnierplanJsonQueryId({
    matchesWidgetUrl: input.matchesWidgetUrl,
    tableWidgetUrl: input.tableWidgetUrl,
  });

  return {
    error: resolved.error,
    queryId: resolved.queryId,
    source: resolved.source,
  };
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
  options?: {
    matchesWidgetUrl?: string | null;
    tableWidgetUrl?: string | null;
  },
): Promise<{ error: string | null; ok: boolean }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, ok: false };
  }

  const resolved = resolveJsonQueryId({
    mtpTournamentId,
    matchesWidgetUrl: options?.matchesWidgetUrl,
    tableWidgetUrl: options?.tableWidgetUrl,
  });
  if (resolved.error || !resolved.queryId) {
    return { error: resolved.error, ok: false };
  }

  const result = await fetchMeinTurnierplanJson(resolved.queryId);
  if (!result.ok) {
    return { error: meinTurnierplanConnectionMessage(result.error), ok: false };
  }

  const parsed = parseMeinTurnierplanPreview(result.data);
  if (!parsed.ok) {
    return { error: parsed.message, ok: false };
  }

  return { error: null, ok: true };
}

export async function loadMeinTurnierplanPreviewAction(
  mtpTournamentId: string,
  options?: {
    matchesWidgetUrl?: string | null;
    tableWidgetUrl?: string | null;
  },
): Promise<{
  error: string | null;
  preview: MeinTurnierplanPreview | null;
  mappingGroups: MeinTurnierplanImportGroup[] | null;
  meta: MeinTurnierplanPreview["meta"] | null;
}> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, preview: null, mappingGroups: null, meta: null };
  }

  const resolved = resolveJsonQueryId({
    mtpTournamentId,
    matchesWidgetUrl: options?.matchesWidgetUrl,
    tableWidgetUrl: options?.tableWidgetUrl,
  });
  if (resolved.error || !resolved.queryId) {
    return { error: resolved.error, preview: null, mappingGroups: null, meta: null };
  }

  const result = await fetchMeinTurnierplanJson(resolved.queryId);
  if (!result.ok) {
    return {
      error: meinTurnierplanConnectionMessage(result.error),
      preview: null,
      mappingGroups: null,
      meta: null,
    };
  }

  const parsed = parseMeinTurnierplanPreview(result.data);
  if (!parsed.ok) {
    return {
      error: parsed.message,
      preview: null,
      mappingGroups: null,
      meta: parsed.meta,
    };
  }

  return {
    error: null,
    preview: parsed.preview,
    mappingGroups: null,
    meta: parsed.meta,
  };
}

export async function loadMeinTurnierplanPreviewForTournamentAction(
  tournamentId: string,
  mtpTournamentId: string,
): Promise<{
  error: string | null;
  preview: MeinTurnierplanPreview | null;
  mappingGroups: MeinTurnierplanImportGroup[] | null;
  meta: MeinTurnierplanPreview["meta"] | null;
}> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, preview: null, mappingGroups: null, meta: null };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, preview: null, mappingGroups: null, meta: null };
  }

  const previewResult = await loadMeinTurnierplanPreviewAction(mtpTournamentId, {
    matchesWidgetUrl: loaded.tournament.mein_turnierplan_matches_widget_url,
    tableWidgetUrl: loaded.tournament.mein_turnierplan_table_widget_url,
  });
  if (previewResult.error || !previewResult.preview) {
    return {
      error: previewResult.error,
      preview: previewResult.preview,
      mappingGroups: null,
      meta: previewResult.meta,
    };
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
    meta: previewResult.meta,
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
