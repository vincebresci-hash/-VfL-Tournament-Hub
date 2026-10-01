"use server";

/**
 * C6-C: Read-only Admin tournament plan preview action.
 * Zero mutation — SELECT/auth + pure plan-preview helpers only.
 * Persistence/apply remains C6-D / existing generate action.
 */

import { createClient } from "@/lib/supabase/server";
import { requireScheduleManage } from "@/lib/rbac/action-access";
import { toUserFacingDbError } from "@/lib/db/errors";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
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

export type PreviewTournamentPlanActionResult = {
  preview: TournamentPlanPreview | null;
  policy: RegenerationPolicyResult | null;
  error: string | null;
};

async function loadTournamentTiming(tournamentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, status, date, start_time, match_duration_minutes, break_minutes, minimum_rest_minutes, lunch_break_start, lunch_break_end",
    )
    .eq("id", tournamentId)
    .maybeSingle();

  if (error || !data) {
    return {
      tournament: null,
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", error),
    };
  }

  return { tournament: data, error: null };
}

function buildRegenerationStageSnapshot(
  tournamentStatus: string | null | undefined,
  stage: Awaited<ReturnType<typeof getAdminTournamentStage>>,
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

/**
 * Read-only organizer plan preview for Admin schedule.
 * Uses saved DB tournament/stage state only — never client competition payloads.
 */
export async function previewTournamentPlanAction(
  tournamentId: string,
): Promise<PreviewTournamentPlanActionResult> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { preview: null, policy: null, error: access.error };
  }

  const id = tournamentId.trim();
  if (!id) {
    return { preview: null, policy: null, error: "Turnier-ID fehlt." };
  }

  const loaded = await loadTournamentTiming(id);
  if (!loaded.tournament) {
    return { preview: null, policy: null, error: loaded.error };
  }

  const stage = await getAdminTournamentStage(id);
  if (!stage.ready) {
    return {
      preview: null,
      policy: null,
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

  return { preview, policy, error: null };
}
