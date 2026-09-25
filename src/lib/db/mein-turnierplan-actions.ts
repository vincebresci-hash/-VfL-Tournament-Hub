"use server";

import { createClient } from "@/lib/supabase/server";
import {
  requireScheduleManage,
  requireTournamentsView,
} from "@/lib/rbac/action-access";
import { listAdminApplications } from "@/lib/db/queries";
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
  const access = await requireTournamentsView();
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
  const access = await requireTournamentsView();
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
  const access = await requireTournamentsView();
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

/**
 * B1-A: Hub is authoritative for competition structure.
 * MeinTurnierplan Gruppen/Teams import into Hub is disabled for normal use.
 * Presentation, widgets, and connection check remain available separately.
 */
const MEIN_TURNIERPLAN_COMPETITION_IMPORT_DISABLED_MESSAGE =
  "Der MeinTurnierplan-Import von Gruppen und Teams ist deaktiviert. Teilnehmer, Gruppen und Zuordnungen werden im VfL Tournament Hub verwaltet. MeinTurnierplan dient nur der öffentlichen Anzeige und externen Live-Darstellung.";

export async function importMeinTurnierplanGroupsAction(
  tournamentId: string,
  groups: MeinTurnierplanImportGroup[],
): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  // B1-A hard block: never mutate Hub groups/memberships via MeinTurnierplan import.
  // Keep signature for call-site compatibility; intentional unused input.
  void tournamentId;
  void groups;
  return {
    error: MEIN_TURNIERPLAN_COMPETITION_IMPORT_DISABLED_MESSAGE,
    notice: null,
  };
}
