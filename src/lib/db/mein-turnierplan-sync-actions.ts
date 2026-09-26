"use server";

import { createClient } from "@/lib/supabase/server";
import {
  requireTournamentsManage,
  requireTournamentsView,
} from "@/lib/rbac/action-access";
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
  resolvePublicMeinTurnierplanJsonQueryId,
  validateMeinTurnierplanTournamentId,
} from "@/lib/mein-turnierplan";
import { applicationBelongsToTournament } from "@/lib/tournaments";
import { shouldSkipMeinTurnierplanLogoSync } from "@/lib/tournament-participant-logos";

/**
 * B1-A: Hub is authoritative for competition data.
 * MeinTurnierplan competition sync (RPC) is disabled for normal use.
 * Presentation/widgets/links remain available separately.
 */
export const MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE =
  "Die MeinTurnierplan-Synchronisation von Turnierdaten ist deaktiviert. Teilnehmer, Gruppen, Spielplan, Ergebnisse und KO werden im VfL Tournament Hub verwaltet. MeinTurnierplan dient nur der öffentlichen Anzeige und externen Turnierinformationen.";

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

/**
 * Persist MeinTurnierplan logo URLs onto external teams without touching
 * rows that have logo_manual_override = true.
 *
 * B1-A: retained for infrastructure compatibility, but no longer reachable
 * from confirmMeinTurnierplanSyncAction (competition sync disabled).
 */
export async function applyMeinTurnierplanTeamLogosAfterSync(input: {
  tournamentId: string;
  teams: Array<{ externalId: string; logoUrl: string | null }>;
}) {
  const supabase = await createClient();
  const teamsWithLogos = input.teams.filter((team) => Boolean(team.logoUrl?.trim()));
  if (teamsWithLogos.length === 0) {
    return;
  }

  const { data: existing } = await supabase
    .from("tournament_external_teams")
    .select("id, external_id, logo_manual_override")
    .eq("tournament_id", input.tournamentId)
    .eq("external_source", "mein-turnierplan");

  const byExternalId = new Map(
    (existing ?? []).map((row) => [String(row.external_id), row]),
  );

  for (const team of teamsWithLogos) {
    const row = byExternalId.get(team.externalId);
    if (!row || shouldSkipMeinTurnierplanLogoSync(Boolean(row.logo_manual_override))) {
      continue;
    }

    await supabase
      .from("tournament_external_teams")
      .update({
        logo_url: team.logoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }
}

export async function previewMeinTurnierplanSyncAction(
  tournamentId: string,
  options?: {
    mappings?: SyncTeamMapping[];
    overridePolicy?: SyncOverridePolicy;
  },
): Promise<{ error: string | null; preview: MeinTurnierplanSyncPreview | null }> {
  const access = await requireTournamentsView();
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
  const access = await requireTournamentsManage();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  // B1-A hard block: never call sync_mein_turnierplan_tournament or post-RPC writes.
  // Keep signature for call-site compatibility; intentional unused input.
  void input;
  return {
    error: MEIN_TURNIERPLAN_COMPETITION_SYNC_DISABLED_MESSAGE,
    notice: null,
  };
}

export async function getMeinTurnierplanSyncStatusAction(tournamentId: string) {
  const access = await requireTournamentsView();
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
