/**
 * C6-D D1: Shared server-authoritative plan preview preparation.
 * Read-only — SELECT + pure plan-preview helpers only.
 * Used by C6-C preview and C6-D apply; must never mutate.
 */

import { createClient } from "@/lib/supabase/server";
import { toUserFacingDbError } from "@/lib/db/errors";
import { getAdminTournamentStage, type AdminTournamentStage } from "@/lib/db/schedule-queries";
import {
  berlinWallTimeToIso,
  normalizeClock,
  wallTimeOnDate,
} from "@/lib/schedule/datetime";
import {
  buildTournamentPlanPreview,
  canRegenerateGroupSchedule,
  type RegenerationPolicyResult,
  type RegenerationStageSnapshot,
  type TournamentPlanPreview,
} from "@/lib/schedule/plan-preview";

export type PlanPreviewTournamentRow = {
  id: string;
  slug: string;
  status: string | null;
  date: string;
  start_time: string | null;
  match_duration_minutes: number | null;
  break_minutes: number | null;
  minimum_rest_minutes: number | null;
  lunch_break_start: string | null;
  lunch_break_end: string | null;
};

export type PreparedTournamentPlan = {
  tournament: PlanPreviewTournamentRow | null;
  stage: AdminTournamentStage | null;
  policy: RegenerationPolicyResult | null;
  preview: TournamentPlanPreview | null;
  error: string | null;
};

export function buildRegenerationStageSnapshot(
  tournamentStatus: string | null | undefined,
  stage: AdminTournamentStage,
): RegenerationStageSnapshot {
  return {
    tournamentStatus: tournamentStatus ?? null,
    groupCount: stage.groups.length,
    matches: stage.matches.map((match) => ({
      phase: match.phase,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
  };
}

async function loadTournamentForPlanPreview(tournamentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, slug, status, date, start_time, match_duration_minutes, break_minutes, minimum_rest_minutes, lunch_break_start, lunch_break_end",
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return {
      tournament: null as PlanPreviewTournamentRow | null,
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", error),
    };
  }

  return { tournament: data as PlanPreviewTournamentRow, error: null };
}

/**
 * Server-authoritative re-read + C6-B policy + C6-A preview from current DB.
 * No INSERT/UPDATE/DELETE/RPC/revalidatePath.
 */
export async function prepareTournamentPlanFromDb(
  tournamentId: string,
): Promise<PreparedTournamentPlan> {
  const loaded = await loadTournamentForPlanPreview(tournamentId);
  if (!loaded.tournament) {
    return {
      tournament: null,
      stage: null,
      policy: null,
      preview: null,
      error: loaded.error,
    };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  if (!stage.ready) {
    return {
      tournament: loaded.tournament,
      stage: null,
      policy: null,
      preview: null,
      error:
        "Die Datenbank ist noch nicht eingerichtet. Bitte die SQL-Migration im Supabase SQL Editor ausführen.",
    };
  }

  const policy = canRegenerateGroupSchedule(
    buildRegenerationStageSnapshot(loaded.tournament.status, stage),
  );

  const participants = Object.values(stage.participantRefById).map((ref) => ({
    applicationId: ref.applicationId,
    externalTeamId: ref.externalTeamId,
  }));

  const groups = stage.groups.map((group) => ({
    key: group.id,
    name: group.name,
    participantIds: stage.memberIdsByGroupId[group.id] ?? [],
  }));

  const startTime = normalizeClock(loaded.tournament.start_time, "09:00");
  const startIso = berlinWallTimeToIso(loaded.tournament.date, startTime);
  const lunchStart = wallTimeOnDate(
    loaded.tournament.date,
    loaded.tournament.lunch_break_start,
  );
  const lunchEnd = wallTimeOnDate(
    loaded.tournament.date,
    loaded.tournament.lunch_break_end,
  );

  // Same BuildTournamentPlanPreviewInput mapping as C6-C (no member/field reordering).
  const preview = buildTournamentPlanPreview({
    mode: groups.length > 0 ? "groups-knockout" : "round-robin",
    participants,
    groups: groups.length > 0 ? groups : undefined,
    fields: stage.fields.map((field) => ({ id: field.id, name: field.name })),
    timing: {
      startIso,
      durationMinutes: loaded.tournament.match_duration_minutes ?? 12,
      breakMinutes: loaded.tournament.break_minutes ?? 3,
      minimumRestMinutes: loaded.tournament.minimum_rest_minutes ?? 15,
      lunchStartIso: lunchStart ? lunchStart.toISOString() : null,
      lunchEndIso: lunchEnd ? lunchEnd.toISOString() : null,
    },
    knockout: null,
  });

  return {
    tournament: loaded.tournament,
    stage,
    policy,
    preview,
    error: null,
  };
}
