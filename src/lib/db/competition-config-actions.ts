"use server";

/**
 * Isolated competition-configuration save.
 * Not referenced by the admin UI, schedule generation, or match persistence.
 *
 * Champions League writes stay inactive until generate and apply refuse that
 * format before deleting matches. This action updates only the three
 * competition columns and only after a conditional updated_at match.
 */

import { revalidatePath } from "next/cache";
import { isMissingRelationError, toUserFacingDbError } from "@/lib/db/errors";
import { loadTournamentLifecycleSnapshot } from "@/lib/db/tournament-lifecycle";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import { requireScheduleManage, requireTournamentsManage } from "@/lib/rbac/action-access";
import {
  validateStoredCompetitionColumns,
  type StoredCompetitionColumns,
} from "@/lib/schedule/competition-config";
import {
  executeCompetitionConfigurationSave,
  type CompetitionConfigurationSaveInput,
  type ConditionalUpdateAttempt,
  type ConfigurationSaveResult,
  type ProvedConfigurationRow,
} from "@/lib/schedule/competition-config-save-executor";
import type { ConfigurationSaveSnapshot } from "@/lib/schedule/competition-config-save-policy";
import { createClient } from "@/lib/supabase/server";

export type { ConfigurationSaveResult };

function revalidateCompetitionConfiguration(id: string, slug: string | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath("/turniere");
  revalidatePath("/", "layout");
  if (slug) {
    revalidatePath(`/admin/turniere/${slug}`);
    revalidatePath(`/turniere/${slug}`);
  }
  revalidatePath(`/admin/turniere/${id}`);
  revalidatePath(`/admin/turniere/${id}/bearbeiten`);
  revalidatePath(`/admin/turniere/${id}/gruppen`);
  revalidatePath(`/admin/turniere/${id}/spielplan`);
  revalidatePath(`/admin/turniere/${id}/ergebnisse`);
  revalidatePath(`/admin/turniere/${id}/ko-runde`);
}

function provedRow(row: {
  id: string;
  slug: string | null;
  updated_at: string;
  competition_format?: string | null;
  league_matches_per_team?: number | null;
  knockout_cutoff?: number | null;
}): ProvedConfigurationRow | null {
  const columns = validateStoredCompetitionColumns({
    competitionFormat: row.competition_format ?? null,
    leagueMatchesPerTeam: row.league_matches_per_team ?? null,
    knockoutCutoff: row.knockout_cutoff ?? null,
  });
  if (!columns.ok || row.updated_at.trim() === "") {
    return null;
  }
  return {
    id: row.id,
    slug: row.slug,
    updatedAt: row.updated_at,
    columns: columns.columns,
  };
}

async function loadCompetitionConfigurationSnapshot(
  tournamentId: string,
): Promise<
  | { status: "not_found" }
  | { status: "missing_columns" }
  | { status: "error"; message: string }
  | { status: "ok"; snapshot: ConfigurationSaveSnapshot }
> {
  const supabase = await createClient();
  const core = await supabase
    .from("tournaments")
    .select("id, slug, updated_at")
    .eq("id", tournamentId)
    .maybeSingle();
  if (core.error) {
    return {
      status: "error",
      message: toUserFacingDbError("Das Turnier konnte nicht gelesen werden.", core.error),
    };
  }
  if (!core.data) {
    return { status: "not_found" };
  }

  const columns = await supabase
    .from("tournaments")
    .select("competition_format, league_matches_per_team, knockout_cutoff")
    .eq("id", tournamentId)
    .maybeSingle();
  if (columns.error) {
    if (isMissingRelationError(columns.error)) {
      return { status: "missing_columns" };
    }
    return {
      status: "error",
      message: toUserFacingDbError("Die Wettbewerbskonfiguration konnte nicht gelesen werden.", columns.error),
    };
  }
  if (!columns.data) {
    return { status: "not_found" };
  }

  const [groups, matches, lifecycle, participants] = await Promise.all([
    supabase.from("tournament_groups").select("id").eq("tournament_id", tournamentId),
    supabase
      .from("tournament_matches")
      .select("phase, status, home_score, away_score")
      .eq("tournament_id", tournamentId),
    loadTournamentLifecycleSnapshot(tournamentId),
    getTournamentParticipants(tournamentId),
  ]);

  if (groups.error || !groups.data) {
    return {
      status: "error",
      message: toUserFacingDbError("Die Gruppen konnten nicht gelesen werden.", groups.error),
    };
  }
  if (matches.error || !matches.data) {
    return {
      status: "error",
      message: toUserFacingDbError("Die Spiele konnten nicht gelesen werden.", matches.error),
    };
  }
  if (lifecycle.error || !lifecycle.snapshot) {
    return {
      status: "error",
      message: lifecycle.error ?? "Der Turnierstatus konnte nicht gelesen werden.",
    };
  }

  return {
    status: "ok",
    snapshot: {
      updatedAt: core.data.updated_at,
      competitionFormat: columns.data.competition_format ?? null,
      leagueMatchesPerTeam: columns.data.league_matches_per_team ?? null,
      knockoutCutoff: columns.data.knockout_cutoff ?? null,
      groupCount: groups.data.length,
      matches: matches.data.map((match) => ({
        phase: match.phase,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
      })),
      effectiveLifecycle: lifecycle.snapshot.effective,
      participants: participants.map((participant) => ({
        applicationId: participant.applicationId,
        externalTeamId: participant.externalTeamId,
      })),
    },
  };
}

async function updateCompetitionConfigurationColumns(input: {
  tournamentId: string;
  expectedUpdatedAt: string;
  columns: StoredCompetitionColumns;
}): Promise<ConditionalUpdateAttempt> {
  const supabase = await createClient();
  const updated = await supabase
    .from("tournaments")
    .update({
      competition_format: input.columns.competitionFormat,
      league_matches_per_team: input.columns.leagueMatchesPerTeam,
      knockout_cutoff: input.columns.knockoutCutoff,
    })
    .eq("id", input.tournamentId)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("id, slug, updated_at, competition_format, league_matches_per_team, knockout_cutoff");

  if (updated.error) {
    return { error: updated.error, rows: null, reread: null };
  }

  const rawRows = updated.data ?? [];
  if (rawRows.length === 1) {
    const row = provedRow(rawRows[0]!);
    if (!row) {
      return { error: null, rows: [], reread: null };
    }
    return { error: null, rows: [row], reread: null };
  }

  const reread = await supabase
    .from("tournaments")
    .select("id, updated_at")
    .eq("id", input.tournamentId)
    .maybeSingle();
  if (reread.error) {
    if (isMissingRelationError(reread.error)) {
      return { error: reread.error, rows: null, reread: null };
    }
    return { error: null, rows: [], reread: null };
  }
  if (!reread.data) {
    return { error: null, rows: [], reread: { found: false, updatedAt: null } };
  }
  return {
    error: null,
    rows: [],
    reread: { found: true, updatedAt: reread.data.updated_at },
  };
}

export async function saveCompetitionConfigurationAction(
  input: CompetitionConfigurationSaveInput,
): Promise<ConfigurationSaveResult> {
  return executeCompetitionConfigurationSave(
    {
      authorize: async () => {
        const schedule = await requireScheduleManage();
        if (schedule.error || !schedule.session) {
          return "forbidden";
        }
        const tournaments = await requireTournamentsManage();
        if (tournaments.error || !tournaments.session) {
          return "forbidden";
        }
        return "ok";
      },
      load: loadCompetitionConfigurationSnapshot,
      updateColumns: updateCompetitionConfigurationColumns,
      revalidate: (row) => revalidateCompetitionConfiguration(row.id, row.slug),
    },
    input,
  );
}
