"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireScheduleManage } from "@/lib/rbac/action-access";
import { toUserFacingDbError } from "@/lib/db/errors";
import { getAdminTournamentStage, type AdminTournamentStage } from "@/lib/db/schedule-queries";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import {
  matchSideDbColumns,
  resolveScheduleParticipantRef,
  scheduleParticipantId,
} from "@/lib/schedule/admin";
import { distributeTeams } from "@/lib/schedule/distribute";
import { fieldDisplayName, groupDisplayName } from "@/lib/schedule/names";
import {
  canRegenerateGroupSchedule,
  type RegenerationPolicyResult,
  type RegenerationStageSnapshot,
} from "@/lib/schedule/plan-preview";
import {
  GROUP_RESULT_LOCKED_BY_KNOCKOUT,
  GROUP_RESULT_LOCKED_MESSAGE,
  canMutateGroupResults,
} from "@/lib/schedule/group-result-lock";
import { datetimeLocalToIso } from "@/lib/schedule/datetime";
import { prepareTournamentPlanFromDb } from "@/lib/db/plan-preview-prepare";
import { persistPreparedGroupSchedule } from "@/lib/db/plan-schedule-persist";
import {
  loadTournamentLifecycleSnapshot,
  syncLifecycleAfterGroupsChanged,
} from "@/lib/db/tournament-lifecycle";
import { lifecycleAllowsDestructiveGroupScheduleMutation } from "@/lib/schedule/tournament-lifecycle";
import {
  EMPTY_GROUP_DELETE_COMPLETED_MESSAGE,
  EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE,
  EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE,
  EMPTY_GROUP_DELETE_NOT_FOUND_MESSAGE,
  emptyGroupDeletionBlockReason,
} from "@/lib/schedule/empty-group-deletion";
import { MATCH_STATUSES, type MatchStatus } from "@/types/schedule";
import type { AdminTournamentRecord } from "@/types/admin";

export type GroupResultMutationActionResult = {
  error: string | null;
  /** Distinguishable lock code for D2; absent/null when unlocked or unrelated errors. */
  code?: typeof GROUP_RESULT_LOCKED_BY_KNOCKOUT | null;
};

function revalidateStage(tournament: Pick<AdminTournamentRecord, "id" | "slug">) {
  revalidatePath("/admin");
  revalidatePath("/admin/turniere");
  revalidatePath(`/admin/turniere/${tournament.id}`);
  revalidatePath(`/admin/turniere/${tournament.id}/gruppen`);
  revalidatePath(`/admin/turniere/${tournament.id}/spielplan`);
  revalidatePath(`/admin/turniere/${tournament.id}/ergebnisse`);
  revalidatePath(`/admin/turniere/${tournament.id}/ko-runde`);
  revalidatePath(`/admin/turniere/${tournament.id}/bearbeiten`);
  revalidatePath(`/turniere/${tournament.slug}`);
  revalidatePath("/turniere");
  revalidatePath("/", "layout");
}

async function loadTournament(tournamentId: string) {
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
      tournament: null,
      error: toUserFacingDbError("Das Turnier wurde nicht gefunden.", error),
    };
  }

  return {
    tournament: data,
    error: null,
  };
}

function buildRegenerationStageSnapshot(
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

function blockedGroupScheduleMutationError(
  tournamentStatus: string | null | undefined,
  stage: AdminTournamentStage,
  effectiveLifecycle?: "setup" | "group_stage" | "knockout_stage" | "completed" | null,
): string | null {
  const policy = canRegenerateGroupSchedule(
    buildRegenerationStageSnapshot(tournamentStatus, stage),
  );
  if (policy.decision === "blocked") {
    return policy.reason;
  }
  // C6-H D2: lifecycle may only tighten destructive group-schedule mutations.
  if (
    effectiveLifecycle &&
    !lifecycleAllowsDestructiveGroupScheduleMutation({
      effectiveLifecycle,
      regenerationPolicy: policy,
    })
  ) {
    return "Der Gruppenspielplan darf im aktuellen Turnier-Lebenszyklus nicht verändert werden.";
  }
  return null;
}

/**
 * Authoritative KO-presence read for C6-F D1 group-result freeze.
 * Residual TOCTOU (concurrent KO insert after this read) is accepted / deferred —
 * same class as C6-B action-level guards; not a transactional lock.
 */
async function tournamentHasKnockoutPhase(tournamentId: string): Promise<{
  hasKnockout: boolean;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tournament_matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("phase", "knockout")
    .limit(1);

  if (error) {
    return {
      hasKnockout: false,
      error: toUserFacingDbError("Die K.-o.-Phase konnte nicht geprüft werden.", error),
    };
  }

  return { hasKnockout: (data?.length ?? 0) > 0, error: null };
}

function groupResultLockedFailure(): GroupResultMutationActionResult {
  return {
    error: GROUP_RESULT_LOCKED_MESSAGE,
    code: GROUP_RESULT_LOCKED_BY_KNOCKOUT,
  };
}

function parseOptionalTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  return `${trimmed}:00`;
}

function parseScore(value: string) {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

function constraintMessage(error: { message?: string; code?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("tournament_matches_teams_distinct")) {
    return "Ein Team kann nicht gegen sich selbst spielen.";
  }
  if (message.includes("tournament_group_members_application_idx")) {
    return "Dieses Team ist bereits einer Gruppe zugeordnet.";
  }
  if (message.includes("tournament_group_members_external_team_idx")) {
    return "Dieses Team ist bereits einer Gruppe zugeordnet.";
  }
  if (error?.code === "23503") {
    return "Die Gruppe kann nicht gelöscht werden, solange Spiele davon abhängen.";
  }
  return toUserFacingDbError(fallback, error);
}

async function loadConfirmedScheduleParticipants(tournamentId: string) {
  return getTournamentParticipants(tournamentId);
}

export async function createTournamentGroupAction(
  tournamentId: string,
  name?: string,
): Promise<{ error: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  const used = new Set(stage.groups.map((group) => group.name.trim().toLowerCase()));
  let label = name?.trim() ?? "";
  if (!label) {
    let index = stage.groups.length;
    label = groupDisplayName(index);
    while (used.has(label.toLowerCase())) {
      index += 1;
      label = groupDisplayName(index);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tournament_groups").insert({
    tournament_id: tournamentId,
    name: label,
    sort_order: stage.groups.length,
  });

  if (error) {
    return { error: constraintMessage(error, "Die Gruppe konnte nicht erstellt werden.") };
  }

  const lifecycleSync = await syncLifecycleAfterGroupsChanged(tournamentId);
  if (lifecycleSync.error) {
    return { error: lifecycleSync.error };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function renameTournamentGroupAction(
  tournamentId: string,
  groupId: string,
  name: string,
): Promise<{ error: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: "Bitte einen Gruppennamen eingeben." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_groups")
    .update({ name: trimmed })
    .eq("id", groupId)
    .eq("tournament_id", tournamentId);

  if (error) {
    return { error: constraintMessage(error, "Die Gruppe konnte nicht umbenannt werden.") };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

/**
 * Delete an empty group that has no match references.
 *
 * Residual TOCTOU (not transactional): a concurrent membership INSERT between the
 * final membership SELECT and DELETE can still be removed by
 * tournament_group_members.group_id ON DELETE CASCADE. Match INSERT is blocked by
 * tournament_matches.group_id ON DELETE RESTRICT (DB error). Full atomic safety
 * would require an approved RPC/transaction — not claimed here.
 */
export async function deleteTournamentGroupAction(
  tournamentId: string,
  groupId: string,
): Promise<{ error: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const lifecycle = await loadTournamentLifecycleSnapshot(tournamentId);
  if (lifecycle.error || !lifecycle.snapshot) {
    return {
      error: lifecycle.error ?? "Der Turnier-Lebenszyklus konnte nicht geprüft werden.",
    };
  }
  if (
    lifecycle.snapshot.facts.marketingStatusCompleted ||
    lifecycle.snapshot.effective === "completed"
  ) {
    return { error: EMPTY_GROUP_DELETE_COMPLETED_MESSAGE };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  if (!stage.groups.some((group) => group.id === groupId)) {
    return { error: EMPTY_GROUP_DELETE_NOT_FOUND_MESSAGE };
  }

  // Stage-level advisory (same shared messages); authoritative reads follow.
  const stageBlock = emptyGroupDeletionBlockReason({
    tournamentCompleted: false,
    memberCount: (stage.memberIdsByGroupId[groupId] ?? []).length,
    matchCountForGroup: stage.matches.filter((match) => match.groupId === groupId)
      .length,
  });
  if (stageBlock) {
    return { error: stageBlock };
  }

  const supabase = await createClient();

  // Authoritative membership + match presence immediately before DELETE.
  const [membersResult, matchesResult] = await Promise.all([
    supabase.from("tournament_group_members").select("id").eq("group_id", groupId),
    supabase
      .from("tournament_matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("group_id", groupId),
  ]);

  if (membersResult.error) {
    return {
      error: toUserFacingDbError(
        "Die Gruppenmitglieder konnten nicht geprüft werden.",
        membersResult.error,
      ),
    };
  }
  if (matchesResult.error) {
    return {
      error: toUserFacingDbError(
        "Die Gruppenspiele konnten nicht geprüft werden.",
        matchesResult.error,
      ),
    };
  }

  if ((membersResult.data ?? []).length > 0) {
    return { error: EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE };
  }
  if ((matchesResult.data ?? []).length > 0) {
    return { error: EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE };
  }

  // Residual TOCTOU: concurrent membership insert may still CASCADE on DELETE.
  // Match insert is DB-restricted (ON DELETE RESTRICT). Not a transactional lock.
  const { data: deletedRows, error } = await supabase
    .from("tournament_groups")
    .delete()
    .eq("id", groupId)
    .eq("tournament_id", tournamentId)
    .select("id");

  if (error) {
    return { error: constraintMessage(error, "Die Gruppe konnte nicht gelöscht werden.") };
  }
  if (!deletedRows || deletedRows.length === 0) {
    return { error: "Die Gruppe konnte nicht gelöscht werden." };
  }

  // C6-H D2: after last group deleted (no KO) → setup; otherwise group_stage.
  const lifecycleSync = await syncLifecycleAfterGroupsChanged(tournamentId);
  if (lifecycleSync.error) {
    return { error: lifecycleSync.error };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function assignTeamToGroupAction(
  tournamentId: string,
  participantId: string,
  groupId: string | null,
): Promise<{ error: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  if (stage.matches.length > 0) {
    return {
      error:
        "Bitte zuerst den Spielplan löschen oder neu generieren, bevor Gruppenzuordnungen geändert werden.",
    };
  }

  const participants = await loadConfirmedScheduleParticipants(tournamentId);
  const ref = resolveScheduleParticipantRef(participantId, participants);
  if (!ref) {
    return { error: "Nur bestätigte Teilnehmer können einer Gruppe zugeordnet werden." };
  }

  const supabase = await createClient();
  const deleteQuery = supabase.from("tournament_group_members").delete();
  const { error: deleteError } = ref.applicationId
    ? await deleteQuery.eq("application_id", ref.applicationId)
    : await deleteQuery.eq("external_team_id", ref.externalTeamId!);

  if (deleteError) {
    return { error: constraintMessage(deleteError, "Die Zuordnung konnte nicht geändert werden.") };
  }

  if (groupId) {
    const { error } = await supabase.from("tournament_group_members").insert({
      group_id: groupId,
      application_id: ref.applicationId,
      external_team_id: ref.externalTeamId,
    });

    if (error) {
      return { error: constraintMessage(error, "Die Zuordnung konnte nicht gespeichert werden.") };
    }
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function autoDistributeTeamsAction(
  tournamentId: string,
  groupCount: number,
  balanceStrength: boolean,
): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  if (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > 16) {
    return { error: "Bitte eine Gruppenanzahl zwischen 1 und 16 wählen.", notice: null };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  if (stage.matches.length > 0) {
    return {
      error: "Automatische Verteilung ist nur möglich, solange noch kein Spielplan existiert.",
      notice: null,
    };
  }

  const participants = await loadConfirmedScheduleParticipants(tournamentId);
  if (participants.length < 2) {
    return { error: "Es werden mindestens zwei bestätigte Teilnehmer benötigt.", notice: null };
  }

  if (groupCount > participants.length) {
    return { error: "Es können nicht mehr Gruppen als Teams angelegt werden.", notice: null };
  }

  const supabase = await createClient();
  const groupIds = stage.groups.map((group) => group.id);

  if (groupIds.length > 0) {
    const { error: clearError } = await supabase
      .from("tournament_group_members")
      .delete()
      .in("group_id", groupIds);

    if (clearError) {
      return { error: constraintMessage(clearError, "Bestehende Zuordnungen konnten nicht geleert werden."), notice: null };
    }
  }

  const groups = [...stage.groups];
  while (groups.length < groupCount) {
    const nameIndex = groups.length;
    const { data, error } = await supabase
      .from("tournament_groups")
      .insert({
        tournament_id: tournamentId,
        name: groupDisplayName(nameIndex),
        sort_order: nameIndex,
      })
      .select("id, tournament_id, name, sort_order")
      .single();

    if (error || !data) {
      return { error: constraintMessage(error, "Gruppen konnten nicht angelegt werden."), notice: null };
    }

    groups.push({
      id: data.id,
      tournamentId: data.tournament_id,
      name: data.name,
      sortOrder: data.sort_order,
    });
  }

  if (groups.length > groupCount) {
    const extraIds = groups.slice(groupCount).map((group) => group.id);
    const { error } = await supabase.from("tournament_groups").delete().in("id", extraIds);
    if (error) {
      return { error: constraintMessage(error, "Überzählige Gruppen konnten nicht entfernt werden."), notice: null };
    }
    groups.splice(groupCount);
  }

  const distributable = participants.flatMap((participant) => {
    const id = scheduleParticipantId(participant);
    if (!id) {
      return [];
    }

    return [
      {
        applicationId: id,
        categoryRank: 0,
        internalStrength: 0,
        selfRatedStrength: 3,
      },
    ];
  });

  const buckets = distributeTeams(distributable, groupCount, { balanceStrength });

  const rows = buckets.flatMap((participantIds, index) => {
    const group = groups[index];
    if (!group) {
      return [];
    }

    return participantIds.flatMap((participantId) => {
      const ref = resolveScheduleParticipantRef(participantId, participants);
      if (!ref) {
        return [];
      }

      return [
        {
          group_id: group.id,
          application_id: ref.applicationId,
          external_team_id: ref.externalTeamId,
        },
      ];
    });
  });

  if (rows.length > 0) {
    const { error } = await supabase.from("tournament_group_members").insert(rows);
    if (error) {
      return { error: constraintMessage(error, "Die automatische Verteilung ist fehlgeschlagen."), notice: null };
    }
  }

  const lifecycleSync = await syncLifecycleAfterGroupsChanged(tournamentId);
  if (lifecycleSync.error) {
    return { error: lifecycleSync.error, notice: null };
  }

  revalidateStage(loaded.tournament);
  const sizes = buckets.map((bucket) => bucket.length).join(" + ");
  return {
    error: null,
    notice: `Teams verteilt: ${sizes} je Gruppe.`,
  };
}

export async function saveScheduleSettingsAction(
  tournamentId: string,
  input: {
    matchDurationMinutes: string;
    breakMinutes: string;
    minimumRestMinutes: string;
    lunchBreakStart: string;
    lunchBreakEnd: string;
    fieldNames: string[];
  },
): Promise<{ error: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const matchDurationMinutes = Number(input.matchDurationMinutes);
  const breakMinutes = Number(input.breakMinutes);
  const minimumRestMinutes = Number(input.minimumRestMinutes);

  if (!Number.isInteger(matchDurationMinutes) || matchDurationMinutes < 5 || matchDurationMinutes > 90) {
    return { error: "Spielzeit muss zwischen 5 und 90 Minuten liegen." };
  }
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 60) {
    return { error: "Die Pause muss zwischen 0 und 60 Minuten liegen." };
  }
  if (!Number.isInteger(minimumRestMinutes) || minimumRestMinutes < 0 || minimumRestMinutes > 180) {
    return { error: "Die Mindestruhezeit muss zwischen 0 und 180 Minuten liegen." };
  }

  const fieldNames = input.fieldNames.map((name) => name.trim()).filter(Boolean);
  if (fieldNames.length === 0) {
    return { error: "Bitte mindestens ein Spielfeld angeben." };
  }

  const supabase = await createClient();
  const { error: tournamentError } = await supabase
    .from("tournaments")
    .update({
      match_duration_minutes: matchDurationMinutes,
      break_minutes: breakMinutes,
      minimum_rest_minutes: minimumRestMinutes,
      lunch_break_start: parseOptionalTime(input.lunchBreakStart),
      lunch_break_end: parseOptionalTime(input.lunchBreakEnd),
    })
    .eq("id", tournamentId);

  if (tournamentError) {
    return { error: toUserFacingDbError("Die Spielplan-Einstellungen konnten nicht gespeichert werden.", tournamentError) };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  const existing = [...stage.fields];

  for (let index = 0; index < fieldNames.length; index += 1) {
    const name = fieldNames[index] ?? fieldDisplayName(index);
    const current = existing[index];
    if (current) {
      const { error } = await supabase
        .from("tournament_fields")
        .update({ name, sort_order: index })
        .eq("id", current.id);
      if (error) {
        return { error: constraintMessage(error, "Spielfelder konnten nicht aktualisiert werden.") };
      }
    } else {
      const { error } = await supabase.from("tournament_fields").insert({
        tournament_id: tournamentId,
        name,
        sort_order: index,
      });
      if (error) {
        return { error: constraintMessage(error, "Spielfelder konnten nicht angelegt werden.") };
      }
    }
  }

  const extra = existing.slice(fieldNames.length);
  if (extra.length > 0) {
    const { error } = await supabase
      .from("tournament_fields")
      .delete()
      .in(
        "id",
        extra.map((field) => field.id),
      );
    if (error) {
      return { error: constraintMessage(error, "Überzählige Spielfelder konnten nicht entfernt werden.") };
    }
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export type GenerateTournamentScheduleStatus =
  | "success"
  | "confirmation_required"
  | "blocked"
  | "validation_error"
  | "persistence_error";

export type GenerateTournamentScheduleActionResult = {
  status: GenerateTournamentScheduleStatus;
  error: string | null;
  notice: string | null;
  policy: RegenerationPolicyResult | null;
  fingerprint: string | null;
};

/**
 * C6-E D1: Legacy generate routed through prepare + shared persist core.
 * Client may send tournamentId + optional confirmReplace only.
 * No fingerprint; no silent default-field creation.
 */
export async function generateTournamentScheduleAction(
  tournamentId: string,
  confirmReplace?: boolean,
): Promise<GenerateTournamentScheduleActionResult> {
  const access = await requireScheduleManage();
  if (access.error) {
    return {
      status: "validation_error",
      error: access.error,
      notice: null,
      policy: null,
      fingerprint: null,
    };
  }

  const id = tournamentId.trim();
  if (!id) {
    return {
      status: "validation_error",
      error: "Turnier-ID fehlt.",
      notice: null,
      policy: null,
      fingerprint: null,
    };
  }

  // Server-authoritative prepare (same planner as Preview/Apply; knockout:null).
  const prepared = await prepareTournamentPlanFromDb(id);
  if (
    prepared.error ||
    !prepared.tournament ||
    !prepared.stage ||
    !prepared.preview ||
    !prepared.policy
  ) {
    return {
      status: "validation_error",
      error: prepared.error ?? "Der Spielplan konnte nicht vorbereitet werden.",
      notice: null,
      policy: prepared.policy,
      fingerprint: prepared.preview?.inputFingerprint ?? null,
    };
  }

  const persisted = await persistPreparedGroupSchedule({
    tournamentId: id,
    tournament: prepared.tournament,
    stage: prepared.stage,
    preview: prepared.preview,
    policy: prepared.policy,
    confirmReplace,
    successNotice: (count) => `${count} Gruppenspiele erzeugt.`,
  });

  return {
    status: persisted.status,
    error: persisted.error,
    notice: persisted.notice,
    policy: persisted.policy,
    fingerprint: persisted.fingerprint,
  };
}

export async function saveTournamentMatchAction(
  tournamentId: string,
  input: {
    matchId?: string;
    groupId: string;
    fieldId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    scheduledAt: string;
    status: MatchStatus;
  },
): Promise<GroupResultMutationActionResult> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  // homeApplicationId / awayApplicationId are schedule participant IDs
  // (application UUID or external-team UUID).
  const homeParticipantId = input.homeApplicationId.trim();
  const awayParticipantId = input.awayApplicationId.trim();

  if (!homeParticipantId || !awayParticipantId) {
    return { error: "Bitte beide Teams auswählen." };
  }

  if (homeParticipantId === awayParticipantId) {
    return { error: "Ein Team kann nicht gegen sich selbst spielen." };
  }

  if (!MATCH_STATUSES.includes(input.status)) {
    return { error: "Ungültiger Spielstatus." };
  }

  const scheduledAt = datetimeLocalToIso(input.scheduledAt);
  const stage = await getAdminTournamentStage(tournamentId);
  const homeGroup = stage.groupIdByApplicationId[homeParticipantId];
  const awayGroup = stage.groupIdByApplicationId[awayParticipantId];
  if (!homeGroup || !awayGroup || homeGroup !== input.groupId || awayGroup !== input.groupId) {
    return { error: "Beide Teams müssen derselben Gruppe angehören." };
  }

  const participants = await loadConfirmedScheduleParticipants(tournamentId);
  const homeRef = resolveScheduleParticipantRef(homeParticipantId, participants);
  const awayRef = resolveScheduleParticipantRef(awayParticipantId, participants);
  if (!homeRef || !awayRef) {
    return { error: "Nur bestätigte Teilnehmer können einem Spiel zugeordnet werden." };
  }

  // This action always writes phase=group. C6-F D1: block group mutations once KO exists.
  // Authoritative phase for an existing row is loaded from DB (not client input).
  const supabase = await createClient();
  if (input.matchId) {
    const { data: existing, error: existingError } = await supabase
      .from("tournament_matches")
      .select("id, phase")
      .eq("id", input.matchId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    if (existingError) {
      return {
        error: toUserFacingDbError("Das Spiel konnte nicht geladen werden.", existingError),
      };
    }
    if (!existing) {
      return { error: "Das Spiel wurde nicht gefunden." };
    }
    if (existing.phase === "knockout") {
      return {
        error: "K.-o.-Spiele können hier nicht als Gruppenspiel bearbeitet werden.",
      };
    }
  }

  const knockoutPresence = await tournamentHasKnockoutPhase(tournamentId);
  if (knockoutPresence.error) {
    return { error: knockoutPresence.error };
  }
  const lock = canMutateGroupResults(
    knockoutPresence.hasKnockout ? [{ phase: "knockout" }] : [],
  );
  if (!lock.allowed) {
    return groupResultLockedFailure();
  }

  const payload = {
    tournament_id: tournamentId,
    group_id: input.groupId,
    field_id: input.fieldId || null,
    ...matchSideDbColumns("home", homeRef),
    ...matchSideDbColumns("away", awayRef),
    scheduled_at: scheduledAt,
    duration_minutes: loaded.tournament.match_duration_minutes ?? 12,
    status: input.status,
    phase: "group" as const,
  };

  const result = input.matchId
    ? await supabase.from("tournament_matches").update(payload).eq("id", input.matchId).eq("tournament_id", tournamentId)
    : await supabase.from("tournament_matches").insert({
        ...payload,
        sort_order: stage.matches.length,
      });

  if (result.error) {
    return { error: constraintMessage(result.error, "Das Spiel konnte nicht gespeichert werden.") };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function deleteTournamentMatchAction(
  tournamentId: string,
  matchId: string,
): Promise<GroupResultMutationActionResult> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("tournament_matches")
    .select("id, phase")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (targetError) {
    return {
      error: toUserFacingDbError("Das Spiel konnte nicht geladen werden.", targetError),
    };
  }
  if (!target) {
    return { error: "Das Spiel wurde nicht gefunden." };
  }

  // Group (or legacy null-phase) deletes can change standings — freeze when KO exists.
  // Knockout single-delete is not wrapped by the group-result freeze (KO bulk delete
  // remains deleteTournamentKnockoutAction).
  if (target.phase !== "knockout") {
    const knockoutPresence = await tournamentHasKnockoutPhase(tournamentId);
    if (knockoutPresence.error) {
      return { error: knockoutPresence.error };
    }
    const lock = canMutateGroupResults(
      knockoutPresence.hasKnockout ? [{ phase: "knockout" }] : [],
    );
    if (!lock.allowed) {
      return groupResultLockedFailure();
    }
  }

  const { error } = await supabase
    .from("tournament_matches")
    .delete()
    .eq("id", matchId)
    .eq("tournament_id", tournamentId);

  if (error) {
    return { error: constraintMessage(error, "Das Spiel konnte nicht gelöscht werden.") };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function deleteTournamentScheduleAction(
  tournamentId: string,
): Promise<{ error: string | null }> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  const lifecycle = await loadTournamentLifecycleSnapshot(tournamentId);

  // C6-B: same shared policy as generate — KO/results/live/completed must hard-block.
  // C6-H D2: lifecycle may tighten further. Residual TOCTOU accepted/deferred.
  const blockedDelete = blockedGroupScheduleMutationError(
    loaded.tournament.status,
    stage,
    lifecycle.snapshot?.effective ?? null,
  );
  if (blockedDelete) {
    return { error: blockedDelete };
  }
  if (lifecycle.error) {
    return { error: lifecycle.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_matches")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (error) {
    return { error: constraintMessage(error, "Der Spielplan konnte nicht gelöscht werden.") };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function saveMatchResultAction(
  tournamentId: string,
  matchId: string,
  homeScore: string,
  awayScore: string,
): Promise<GroupResultMutationActionResult> {
  const access = await requireScheduleManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const home = parseScore(homeScore);
  const away = parseScore(awayScore);
  if (home == null || away == null) {
    return { error: "Bitte gültige Tore (0–999) eintragen." };
  }

  // C6-F D1: authoritative KO presence before any group result write.
  // Residual TOCTOU vs concurrent KO generation is accepted / deferred.
  const knockoutPresence = await tournamentHasKnockoutPhase(tournamentId);
  if (knockoutPresence.error) {
    return { error: knockoutPresence.error };
  }
  const lock = canMutateGroupResults(
    knockoutPresence.hasKnockout ? [{ phase: "knockout" }] : [],
  );
  if (!lock.allowed) {
    return groupResultLockedFailure();
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_matches")
    .update({
      home_score: home,
      away_score: away,
      status: "completed",
      manual_override: true,
    })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (error) {
    return { error: constraintMessage(error, "Das Ergebnis konnte nicht gespeichert werden.") };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}
