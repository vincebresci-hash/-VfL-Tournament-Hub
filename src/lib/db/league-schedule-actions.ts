"use server";

/**
 * Persist a server-rebuilt Champions League league phase.
 * The client sends a fingerprint and the two league settings.
 * Matches, groups, and competition columns are written only by
 * apply_champions_league_league_phase. The column-only save stays inactive.
 */

import { revalidatePath } from "next/cache";
import { readConfirmedParticipantIdentities } from "@/lib/db/confirmed-participant-read";
import { readStoredLeagueScheduleConfig } from "@/lib/db/league-config-read";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { requireScheduleManage, requireTournamentsManage } from "@/lib/rbac/action-access";
import { buildChampionsLeagueAdminPreview, savedTournamentPlanTiming } from "@/lib/schedule/league-admin-preview";
import type { LeagueKnockoutCutoff } from "@/lib/schedule/league-phase";
import { canRegenerateGroupSchedule } from "@/lib/schedule/plan-preview";
import type { RegenerationPolicyResult } from "@/lib/schedule/plan-preview";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";

export type ApplyChampionsLeagueStatus =
  | "success"
  | "stale_preview"
  | "confirmation_required"
  | "blocked"
  | "validation_error"
  | "persistence_error"
  | "forbidden";

export type ApplyChampionsLeagueResult = {
  status: ApplyChampionsLeagueStatus;
  error: string | null;
  notice: string | null;
  policy: RegenerationPolicyResult | null;
  fingerprint: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function result(
  status: ApplyChampionsLeagueStatus,
  error: string | null,
  extras?: {
    notice?: string | null;
    policy?: RegenerationPolicyResult | null;
    fingerprint?: string | null;
  },
): ApplyChampionsLeagueResult {
  return {
    status,
    error,
    notice: extras?.notice ?? null,
    policy: extras?.policy ?? null,
    fingerprint: extras?.fingerprint ?? null,
  };
}

function isCutoff(value: number): value is LeagueKnockoutCutoff {
  return value === 4 || value === 8;
}

function sideIsCanonical(applicationId: string | null, externalTeamId: string | null) {
  const hasApplication = Boolean(applicationId);
  const hasExternal = Boolean(externalTeamId);
  return hasApplication !== hasExternal;
}

function readRpcPayload(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const status = value.status;
  const code = value.code;
  const error = value.error;
  const groupId = value.groupId;
  const matchCount = value.matchCount;
  if (typeof status !== "string") {
    return null;
  }
  return {
    status,
    code: typeof code === "string" ? code : null,
    error: typeof error === "string" ? error : null,
    groupId: typeof groupId === "string" ? groupId : null,
    matchCount: typeof matchCount === "number" ? matchCount : 0,
  };
}

function revalidateTournament(id: string, slug: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${id}`);
  revalidatePath(`/admin/turniere/${id}/gruppen`);
  revalidatePath(`/admin/turniere/${id}/spielplan`);
  revalidatePath(`/admin/turniere/${id}/ergebnisse`);
  revalidatePath(`/admin/turniere/${id}/ko-runde`);
  revalidatePath(`/turniere/${slug}`);
  revalidatePath("/turniere");
  revalidatePath("/", "layout");
}

export async function applyChampionsLeagueScheduleAction(input: {
  tournamentId: string;
  previewFingerprint: string;
  matchesPerTeam: number;
  knockoutCutoff: number;
  confirmReplace?: boolean;
}): Promise<ApplyChampionsLeagueResult> {
  const schedule = await requireScheduleManage();
  if (schedule.error || !schedule.session) {
    return result("forbidden", schedule.error ?? "Keine Berechtigung für diese Aktion.");
  }
  const tournaments = await requireTournamentsManage();
  if (tournaments.error || !tournaments.session) {
    return result("forbidden", tournaments.error ?? "Keine Berechtigung für diese Aktion.");
  }

  const tournamentId = input.tournamentId.trim();
  const fingerprint = input.previewFingerprint.trim();
  if (!tournamentId || !fingerprint) {
    return result("validation_error", "Die Vorschau konnte nicht zugeordnet werden.");
  }
  if (!Number.isInteger(input.matchesPerTeam) || !isCutoff(input.knockoutCutoff)) {
    return result("validation_error", "Die Ligaeinstellungen sind ungültig.");
  }

  const stored = await readStoredLeagueScheduleConfig(tournamentId);
  if (stored.status === "missing_column") {
    return result(
      "persistence_error",
      "Die Wettbewerbsspalten sind in der Datenbank noch nicht vorhanden. Es wurde nichts gespeichert.",
    );
  }
  if (stored.status === "not_found") {
    return result("validation_error", "Das Turnier wurde nicht gefunden.");
  }
  if (stored.status === "error") {
    return result("validation_error", stored.message);
  }
  if (
    stored.competitionFormat === "round-robin" ||
    stored.competitionFormat === "groups-knockout"
  ) {
    return result(
      "blocked",
      "Ein gespeichertes Bestandsformat kann nicht als Champions League überschrieben werden.",
    );
  }

  const supabase = await createClient();
  const loaded = await supabase
    .from("tournaments")
    .select(
      "id, slug, date, start_time, match_duration_minutes, break_minutes, minimum_rest_minutes, lunch_break_start, lunch_break_end, status",
    )
    .eq("id", tournamentId)
    .maybeSingle();
  if (loaded.error || !loaded.data) {
    return result("validation_error", "Das Turnier wurde nicht gefunden.");
  }

  const stage = await getAdminTournamentStage(tournamentId);
  if (!stage.ready) {
    return result(
      "persistence_error",
      "Die Datenbank ist noch nicht eingerichtet. Bitte die SQL-Migration im Supabase SQL Editor ausführen.",
    );
  }

  const policy = canRegenerateGroupSchedule({
    tournamentStatus: loaded.data.status,
    groupCount: stage.groups.length,
    matches: stage.matches.map((match) => ({
      phase: match.phase,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
  });
  if (policy.decision === "blocked") {
    return result("blocked", policy.reason, { policy });
  }
  if (policy.decision === "allowedWithConfirmation" && input.confirmReplace !== true) {
    return result(
      "confirmation_required",
      "Es besteht bereits ein Spielplan ohne Ergebnisse. Bitte bestätige ausdrücklich, dass er ersetzt werden soll.",
      { policy },
    );
  }

  const confirmed = await readConfirmedParticipantIdentities(tournamentId);
  if (!confirmed.ok) {
    return result("validation_error", confirmed.message, { policy });
  }

  const preview = buildChampionsLeagueAdminPreview({
    participants: confirmed.participants.map((participant) => ({
      applicationId: participant.applicationId,
      externalTeamId: participant.externalTeamId,
    })),
    matchesPerTeam: input.matchesPerTeam,
    knockoutCutoff: input.knockoutCutoff,
    fields: stage.fields.map((field) => ({ id: field.id, name: field.name })),
    timing: savedTournamentPlanTiming({
      date: loaded.data.date,
      startTime: loaded.data.start_time,
      matchDurationMinutes: loaded.data.match_duration_minutes ?? 12,
      breakMinutes: loaded.data.break_minutes ?? 3,
      minimumRestMinutes: loaded.data.minimum_rest_minutes ?? 15,
      lunchBreakStart: loaded.data.lunch_break_start ?? null,
      lunchBreakEnd: loaded.data.lunch_break_end ?? null,
    }),
  });

  if (preview.inputFingerprint !== fingerprint) {
    return result(
      "stale_preview",
      "Die Turnierdaten haben sich seit der Vorschau geändert. Bitte aktualisiere die Vorschau und prüfe den Spielplan erneut.",
      { policy, fingerprint: preview.inputFingerprint },
    );
  }

  const blocking = preview.warnings.some((warning) =>
    ["LEAGUE_CONFIG_INVALID", "NO_FIELDS", "TIMETABLE_INCOMPLETE", "NO_PARTICIPANTS"].includes(
      warning.code,
    ),
  );
  const expected = preview.summary.expectedLeagueMatchCount;
  if (
    preview.mode !== "champions-league" ||
    blocking ||
    expected == null ||
    preview.summary.scheduledLeagueMatchCount !== expected ||
    preview.matches.length !== expected ||
    preview.matches.some((match) => !match.scheduledAt || !match.fieldId) ||
    preview.matches.some(
      (match) =>
        !sideIsCanonical(match.home.applicationId, match.home.externalTeamId) ||
        !sideIsCanonical(match.away.applicationId, match.away.externalTeamId),
    )
  ) {
    return result(
      "validation_error",
      "Die Ligabegegnungen sind nicht vollständig eingeplant und werden nicht gespeichert.",
      { policy, fingerprint },
    );
  }

  const rows = preview.matches.map((match) => ({
    homeApplicationId: match.home.applicationId,
    homeExternalTeamId: match.home.externalTeamId,
    awayApplicationId: match.away.applicationId,
    awayExternalTeamId: match.away.externalTeamId,
    fieldId: match.fieldId,
    scheduledAt: match.scheduledAt,
    durationMinutes: match.durationMinutes,
    sortOrder: match.sortOrder,
  }));

  const applied = await supabase.rpc("apply_champions_league_league_phase", {
    p_tournament_id: tournamentId,
    p_expected_updated_at: stored.updatedAt,
    p_league_matches_per_team: input.matchesPerTeam,
    p_knockout_cutoff: input.knockoutCutoff,
    p_confirm_replace: input.confirmReplace === true,
    p_matches: rows,
  });

  if (applied.error) {
    const message = (applied.error.message ?? "").toLowerCase();
    if (applied.error.code === "PGRST202" || message.includes("apply_champions_league_league_phase")) {
      return result(
        "persistence_error",
        "Die Liga-Speicherung ist in der Datenbank noch nicht vorhanden. Es wurde nichts gespeichert.",
        { policy, fingerprint },
      );
    }
    return result(
      "persistence_error",
      "Der Ligaspielplan konnte nicht gespeichert werden.",
      { policy, fingerprint },
    );
  }

  const payload = readRpcPayload(applied.data);
  if (!payload) {
    return result(
      "persistence_error",
      "Der Ligaspielplan konnte nicht als gespeichert nachgewiesen werden.",
      { policy, fingerprint },
    );
  }
  if (payload.status === "success") {
    if (!payload.groupId || !UUID_PATTERN.test(payload.groupId) || payload.matchCount !== expected) {
      return result(
        "persistence_error",
        "Der Ligaspielplan konnte nicht als gespeichert nachgewiesen werden.",
        { policy, fingerprint },
      );
    }
    revalidateTournament(loaded.data.id, loaded.data.slug);
    return result("success", null, {
      notice: `${payload.matchCount} Ligabegegnungen übernommen.`,
      policy,
      fingerprint,
    });
  }
  if (payload.status === "confirmation_required") {
    return result("confirmation_required", payload.error, { policy, fingerprint });
  }
  if (payload.status === "stale_configuration") {
    return result(
      "stale_preview",
      payload.error ?? "Die Turnierdaten haben sich seit der Vorschau geändert.",
      { policy, fingerprint },
    );
  }
  if (payload.status === "forbidden") {
    return result("forbidden", payload.error ?? "Keine Berechtigung für diese Aktion.", {
      policy,
      fingerprint,
    });
  }
  if (payload.status === "config_locked" || payload.status === "blocked") {
    return result("blocked", payload.error ?? "Der Ligaspielplan darf nicht gespeichert werden.", {
      policy,
      fingerprint,
    });
  }
  return result(
    payload.status === "validation_error" ? "validation_error" : "persistence_error",
    payload.error ?? "Der Ligaspielplan konnte nicht gespeichert werden.",
    { policy, fingerprint },
  );
}
