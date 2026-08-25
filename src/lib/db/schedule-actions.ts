"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin } from "@/lib/auth/roles";
import { toUserFacingDbError } from "@/lib/db/errors";
import { listAdminApplications } from "@/lib/db/queries";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { categoryRank, distributeTeams } from "@/lib/schedule/distribute";
import { fieldDisplayName, groupDisplayName } from "@/lib/schedule/names";
import {
  expectedGroupMatchCount,
  hasSelfPlay,
  interleaveGroupFixtures,
  roundRobinFixtures,
} from "@/lib/schedule/round-robin";
import { buildTimetable } from "@/lib/schedule/timetable";
import { berlinWallTimeToIso, datetimeLocalToIso, normalizeClock, wallTimeOnDate } from "@/lib/schedule/datetime";
import { applicationBelongsToTournament } from "@/lib/tournaments";
import { MATCH_STATUSES, type MatchStatus } from "@/types/schedule";
import type { AdminTournamentRecord } from "@/types/admin";

async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || !canAccessAdmin(session.user.role)) {
    return { session: null, error: "Kein Adminzugang." };
  }

  return { session, error: null };
}

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
      "id, slug, date, start_time, match_duration_minutes, break_minutes, minimum_rest_minutes, lunch_break_start, lunch_break_end",
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
  if (error?.code === "23503") {
    return "Die Gruppe kann nicht gelöscht werden, solange Spiele davon abhängen.";
  }
  return toUserFacingDbError(fallback, error);
}

async function acceptedParticipants(tournament: Pick<AdminTournamentRecord, "id" | "slug">) {
  const result = await listAdminApplications();
  return result.applications.filter(
    (application) =>
      applicationBelongsToTournament(application, tournament) &&
      application.applicationStatus === "accepted",
  );
}

export async function createTournamentGroupAction(
  tournamentId: string,
  name?: string,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
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

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function renameTournamentGroupAction(
  tournamentId: string,
  groupId: string,
  name: string,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
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

export async function deleteTournamentGroupAction(
  tournamentId: string,
  groupId: string,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  if (stage.matches.some((match) => match.groupId === groupId)) {
    return { error: "Die Gruppe kann nicht gelöscht werden, solange Spiele davon abhängen." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_groups")
    .delete()
    .eq("id", groupId)
    .eq("tournament_id", tournamentId);

  if (error) {
    return { error: constraintMessage(error, "Die Gruppe konnte nicht gelöscht werden.") };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function assignTeamToGroupAction(
  tournamentId: string,
  applicationId: string,
  groupId: string | null,
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
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

  const participants = await acceptedParticipants(loaded.tournament);
  if (!participants.some((application) => application.id === applicationId)) {
    return { error: "Nur bestätigte Teilnehmer können einer Gruppe zugeordnet werden." };
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("tournament_group_members")
    .delete()
    .eq("application_id", applicationId);

  if (deleteError) {
    return { error: constraintMessage(deleteError, "Die Zuordnung konnte nicht geändert werden.") };
  }

  if (groupId) {
    const { error } = await supabase.from("tournament_group_members").insert({
      group_id: groupId,
      application_id: applicationId,
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
  const access = await requireAdmin();
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

  const participants = await acceptedParticipants(loaded.tournament);
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

  const buckets = distributeTeams(
    participants.map((application) => ({
      applicationId: application.id,
      categoryRank: categoryRank(application.internalCategory),
      internalStrength: application.internalStrength ?? 0,
      selfRatedStrength: application.selfRatedStrength,
    })),
    groupCount,
    { balanceStrength },
  );

  const rows = buckets.flatMap((applicationIds, index) => {
    const group = groups[index];
    if (!group) {
      return [];
    }

    return applicationIds.map((applicationId) => ({
      group_id: group.id,
      application_id: applicationId,
    }));
  });

  if (rows.length > 0) {
    const { error } = await supabase.from("tournament_group_members").insert(rows);
    if (error) {
      return { error: constraintMessage(error, "Die automatische Verteilung ist fehlgeschlagen."), notice: null };
    }
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
  const access = await requireAdmin();
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

export async function generateTournamentScheduleAction(
  tournamentId: string,
): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  let stage = await getAdminTournamentStage(tournamentId);
  const populatedGroups = stage.groups.filter(
    (group) => (stage.memberIdsByGroupId[group.id] ?? []).length >= 2,
  );

  if (populatedGroups.length === 0) {
    return {
      error: "Bitte zuerst Gruppen mit mindestens zwei Teams anlegen.",
      notice: null,
    };
  }

  const supabase = await createClient();

  if (stage.fields.length === 0) {
    const { error } = await supabase.from("tournament_fields").insert({
      tournament_id: tournamentId,
      name: fieldDisplayName(0),
      sort_order: 0,
    });
    if (error) {
      return { error: constraintMessage(error, "Es konnte kein Spielfeld angelegt werden."), notice: null };
    }
    stage = await getAdminTournamentStage(tournamentId);
  }

  const fixtures = interleaveGroupFixtures(
    populatedGroups.map((group) => {
      const teamIds = stage.memberIdsByGroupId[group.id] ?? [];
      return roundRobinFixtures(teamIds).map((fixture) => ({
        ...fixture,
        groupId: group.id,
      }));
    }),
  );

  if (hasSelfPlay(fixtures)) {
    return { error: "Der Spielplan enthielt eine ungültige Begegnung gegen sich selbst.", notice: null };
  }

  const expected = populatedGroups.reduce(
    (sum, group) => sum + expectedGroupMatchCount((stage.memberIdsByGroupId[group.id] ?? []).length),
    0,
  );
  if (fixtures.length !== expected) {
    return { error: "Die Anzahl der Gruppenspiele stimmt nicht mit der Round-Robin-Vorgabe überein.", notice: null };
  }

  const startTime = normalizeClock(loaded.tournament.start_time, "09:00");
  const start = new Date(berlinWallTimeToIso(loaded.tournament.date, startTime));
  const lunchStart = wallTimeOnDate(loaded.tournament.date, loaded.tournament.lunch_break_start);
  const lunchEnd = wallTimeOnDate(loaded.tournament.date, loaded.tournament.lunch_break_end);

  const timetable = buildTimetable(fixtures, stage.fields, {
    start,
    durationMinutes: loaded.tournament.match_duration_minutes ?? 12,
    breakMinutes: loaded.tournament.break_minutes ?? 3,
    minimumRestMinutes: loaded.tournament.minimum_rest_minutes ?? 15,
    lunchStart,
    lunchEnd,
  });

  if (timetable.matches.length === 0) {
    return {
      error: timetable.warnings[0] ?? "Der Spielplan konnte nicht erzeugt werden.",
      notice: null,
    };
  }

  const { error: deleteError } = await supabase
    .from("tournament_matches")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (deleteError) {
    return { error: constraintMessage(deleteError, "Der bestehende Spielplan konnte nicht ersetzt werden."), notice: null };
  }

  const { error: insertError } = await supabase.from("tournament_matches").insert(
    timetable.matches.map((match) => ({
      tournament_id: tournamentId,
      group_id: match.groupId,
      field_id: match.fieldId,
      home_application_id: match.homeId,
      away_application_id: match.awayId,
      scheduled_at: match.scheduledAt.toISOString(),
      duration_minutes: match.durationMinutes,
      status: "scheduled" as const,
      phase: "group" as const,
      sort_order: match.sortOrder,
    })),
  );

  if (insertError) {
    return { error: constraintMessage(insertError, "Der Spielplan konnte nicht gespeichert werden."), notice: null };
  }

  revalidateStage(loaded.tournament);
  const notice = [
    `${timetable.matches.length} Gruppenspiele erzeugt.`,
    ...timetable.warnings,
  ].join(" ");
  return { error: null, notice };
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
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  if (input.homeApplicationId === input.awayApplicationId) {
    return { error: "Ein Team kann nicht gegen sich selbst spielen." };
  }

  if (!MATCH_STATUSES.includes(input.status)) {
    return { error: "Ungültiger Spielstatus." };
  }

  const scheduledAt = datetimeLocalToIso(input.scheduledAt);
  const stage = await getAdminTournamentStage(tournamentId);
  const homeGroup = stage.groupIdByApplicationId[input.homeApplicationId];
  const awayGroup = stage.groupIdByApplicationId[input.awayApplicationId];
  if (!homeGroup || !awayGroup || homeGroup !== input.groupId || awayGroup !== input.groupId) {
    return { error: "Beide Teams müssen derselben Gruppe angehören." };
  }

  const supabase = await createClient();
  const payload = {
    tournament_id: tournamentId,
    group_id: input.groupId,
    field_id: input.fieldId || null,
    home_application_id: input.homeApplicationId,
    away_application_id: input.awayApplicationId,
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
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const supabase = await createClient();
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
  const access = await requireAdmin();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
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
): Promise<{ error: string | null }> {
  const access = await requireAdmin();
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
