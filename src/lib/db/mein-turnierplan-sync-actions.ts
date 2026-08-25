"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { listAdminApplications } from "@/lib/db/queries";
import { fetchMeinTurnierplanJson } from "@/lib/mein-turnierplan-api";
import { normalizeMeinTurnierplanSyncPayload } from "@/lib/mein-turnierplan-sync-normalize";
import {
  buildMeinTurnierplanSyncPreview,
  type HubSyncSnapshot,
  type MeinTurnierplanSyncPreview,
  type SyncOverridePolicy,
  type SyncTeamMapping,
} from "@/lib/mein-turnierplan-sync";
import {
  buildMeinTurnierplanSyncRpcPayload,
  type MeinTurnierplanSyncRpcResult,
} from "@/lib/mein-turnierplan-sync-rpc-payload";
import {
  resolvePublicMeinTurnierplanJsonQueryId,
  validateMeinTurnierplanTournamentId,
} from "@/lib/mein-turnierplan";
import { applicationBelongsToTournament } from "@/lib/tournaments";

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { session: null, error: "Kein Adminzugang." };
  }

  return { session, error: null };
}

async function loadTournamentForSync(tournamentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, slug, mein_turnierplan_tournament_id, mein_turnierplan_matches_widget_url, mein_turnierplan_table_widget_url, mein_turnierplan_last_synced_at, mein_turnierplan_sync_meta",
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return { tournament: null, error: "Das Turnier wurde nicht gefunden." };
  }

  return { tournament: data, error: null };
}

function resolveQueryId(tournament: {
  mein_turnierplan_tournament_id?: string | null;
  mein_turnierplan_matches_widget_url?: string | null;
  mein_turnierplan_table_widget_url?: string | null;
}) {
  const fromPublic = resolvePublicMeinTurnierplanJsonQueryId({
    meinTurnierplanEnabled: true,
    meinTurnierplanUrl: null,
    meinTurnierplanTournamentId: tournament.mein_turnierplan_tournament_id ?? null,
    meinTurnierplanMatchesWidgetUrl:
      tournament.mein_turnierplan_matches_widget_url ?? null,
    meinTurnierplanTableWidgetUrl: tournament.mein_turnierplan_table_widget_url ?? null,
  });
  if (fromPublic) {
    return { queryId: fromPublic, error: null as string | null };
  }

  const numeric = validateMeinTurnierplanTournamentId(
    tournament.mein_turnierplan_tournament_id ?? "",
    { required: true },
  );
  return { queryId: numeric.value, error: numeric.error };
}

async function loadHubSyncSnapshot(tournamentId: string, slug: string): Promise<HubSyncSnapshot> {
  const supabase = await createClient();
  const [externalTeams, groups, fields, matches, applicationsResult] = await Promise.all([
    supabase
      .from("tournament_external_teams")
      .select("id, external_id, name, application_id, manual_override")
      .eq("tournament_id", tournamentId),
    supabase
      .from("tournament_groups")
      .select("id, name, external_id, manual_override")
      .eq("tournament_id", tournamentId),
    supabase
      .from("tournament_fields")
      .select("id, name, external_id, manual_override")
      .eq("tournament_id", tournamentId),
    supabase
      .from("tournament_matches")
      .select("id, external_id, manual_override, home_score, away_score, status")
      .eq("tournament_id", tournamentId),
    listAdminApplications(),
  ]);

  const acceptedApplications = applicationsResult.applications
    .filter(
      (application) =>
        applicationBelongsToTournament(application, { id: tournamentId, slug }) &&
        application.applicationStatus === "accepted",
    )
    .map((application) => ({
      applicationId: application.id,
      clubName: application.clubName,
      teamName: application.teamName,
    }));

  return {
    externalTeams: (externalTeams.data ?? []).map((row) => ({
      id: row.id,
      externalId: String(row.external_id),
      name: String(row.name),
      applicationId: row.application_id ? String(row.application_id) : null,
      manualOverride: Boolean(row.manual_override),
    })),
    groups: (groups.data ?? []).map((row) => ({
      id: row.id,
      name: String(row.name),
      externalId: row.external_id ? String(row.external_id) : null,
      manualOverride: Boolean(row.manual_override),
    })),
    fields: (fields.data ?? []).map((row) => ({
      id: row.id,
      name: String(row.name),
      externalId: row.external_id ? String(row.external_id) : null,
      manualOverride: Boolean(row.manual_override),
    })),
    matches: (matches.data ?? []).map((row) => ({
      id: row.id,
      externalId: row.external_id ? String(row.external_id) : null,
      manualOverride: Boolean(row.manual_override),
      homeScore: row.home_score as number | null,
      awayScore: row.away_score as number | null,
      status: String(row.status),
    })),
    acceptedApplications,
  };
}

function revalidateTournament(slug: string, tournamentId: string) {
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${tournamentId}`);
  revalidatePath(`/admin/turniere/${tournamentId}/gruppen`);
  revalidatePath(`/admin/turniere/${tournamentId}/spielplan`);
  revalidatePath(`/admin/turniere/${tournamentId}/ko-runde`);
  revalidatePath(`/admin/turniere/${tournamentId}/ergebnisse`);
  revalidatePath(`/turniere/${slug}`);
}

function formatSyncNotice(
  preview: MeinTurnierplanSyncPreview,
  result: MeinTurnierplanSyncRpcResult,
) {
  const protectedPart =
    result.protectedOverrides > 0
      ? ` (${result.protectedOverrides} manuelle Anpassungen geschützt)`
      : "";

  return `Synchronisation abgeschlossen: ${preview.counts.teamsFound} Teams, ${preview.counts.groupsFound} Gruppen, ${preview.counts.matchesFound} Spiele (${preview.counts.resultsPresent} Ergebnisse). Neu: ${result.matchesInserted}, aktualisiert: ${result.matchesUpdated}${protectedPart}.`;
}

export async function previewMeinTurnierplanSyncAction(
  tournamentId: string,
  options?: {
    mappings?: SyncTeamMapping[];
    overridePolicy?: SyncOverridePolicy;
  },
): Promise<{ error: string | null; preview: MeinTurnierplanSyncPreview | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, preview: null };
  }

  const loaded = await loadTournamentForSync(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, preview: null };
  }

  const resolved = resolveQueryId(loaded.tournament);
  if (!resolved.queryId) {
    return {
      error:
        resolved.error ??
        "Für die Synchronisation fehlt eine öffentliche MeinTurnierplan-Kennung oder Widget-URL.",
      preview: null,
    };
  }

  const fetched = await fetchMeinTurnierplanJson(resolved.queryId);
  if (!fetched.ok) {
    return {
      error: "MeinTurnierplan-Daten konnten nicht geladen werden.",
      preview: null,
    };
  }

  const normalized = normalizeMeinTurnierplanSyncPayload(fetched.data);
  if (!normalized.ok) {
    return { error: normalized.error, preview: null };
  }

  const snapshot = await loadHubSyncSnapshot(
    loaded.tournament.id,
    loaded.tournament.slug,
  );

  const preview = buildMeinTurnierplanSyncPreview({
    queryId: resolved.queryId,
    payload: normalized.payload,
    snapshot,
    mappings: options?.mappings,
    overridePolicy: options?.overridePolicy,
  });

  return { error: null, preview };
}

export async function confirmMeinTurnierplanSyncAction(input: {
  tournamentId: string;
  mappings: SyncTeamMapping[];
  overridePolicy: SyncOverridePolicy;
}): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournamentForSync(input.tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  const previewResult = await previewMeinTurnierplanSyncAction(input.tournamentId, {
    mappings: input.mappings,
    overridePolicy: input.overridePolicy,
  });
  if (previewResult.error || !previewResult.preview) {
    return { error: previewResult.error ?? "Vorschau fehlgeschlagen.", notice: null };
  }

  const preview = previewResult.preview;
  const supabase = await createClient();
  const rpcPayload = buildMeinTurnierplanSyncRpcPayload({
    queryId: preview.queryId,
    payload: preview.payload,
    mappings: preview.mappings,
  });

  const { data, error } = await supabase.rpc("sync_mein_turnierplan_tournament", {
    p_tournament_id: loaded.tournament.id,
    p_payload: rpcPayload,
    p_overwrite_manual: input.overridePolicy === "overwrite-manual",
  });

  if (error) {
    return {
      error: error.message || "Die Synchronisation ist fehlgeschlagen.",
      notice: null,
    };
  }

  const result = data as MeinTurnierplanSyncRpcResult | null;
  if (!result?.success) {
    return {
      error: "Die Synchronisation ist fehlgeschlagen.",
      notice: null,
    };
  }

  revalidateTournament(loaded.tournament.slug, loaded.tournament.id);

  return {
    error: null,
    notice: formatSyncNotice(preview, result),
  };
}

export async function getMeinTurnierplanSyncStatusAction(tournamentId: string) {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, status: null };
  }

  const loaded = await loadTournamentForSync(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, status: null };
  }

  return {
    error: null,
    status: {
      lastSyncedAt: loaded.tournament.mein_turnierplan_last_synced_at as string | null,
      meta: loaded.tournament.mein_turnierplan_sync_meta as Record<string, unknown> | null,
      queryId: resolveQueryId(loaded.tournament).queryId,
    },
  };
}
