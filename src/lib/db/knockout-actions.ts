"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireResultsManage } from "@/lib/rbac/action-access";
import { toUserFacingDbError } from "@/lib/db/errors";
import { getAdminTournamentStage } from "@/lib/db/schedule-queries";
import { addMinutes, datetimeLocalToIso } from "@/lib/schedule/datetime";
import {
  buildKnockoutPlan,
  hasDuplicateTeamInRound,
  isGroupStageComplete,
  KNOCKOUT_SCHEDULE_WAVES,
  propagateKnockoutTeams,
  qualifyTopTwo,
  resolveKnockoutOutcome,
  type KnockoutFormat,
  type KnockoutOptions,
} from "@/lib/schedule/knockout";
import { computeGroupStandings } from "@/lib/schedule/standings";
import { buildTimetable } from "@/lib/schedule/timetable";
import type { AdminTournamentRecord } from "@/types/admin";
import type { DecidedBy, TournamentMatchRecord } from "@/types/schedule";

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
      "id, slug, date, start_time, match_duration_minutes, break_minutes, minimum_rest_minutes, lunch_break_start, lunch_break_end, status",
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

function parseScore(value: string) {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

export async function generateKnockoutAction(
  tournamentId: string,
  input: {
    format: KnockoutFormat;
    includeThirdPlace: boolean;
    includePlacement5: boolean;
    includePlacement7: boolean;
    forceIncomplete: boolean;
    startAt: string;
  },
): Promise<{ error: string | null; notice: string | null }> {
  const access = await requireResultsManage();
  if (access.error) {
    return { error: access.error, notice: null };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error, notice: null };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  const expectedGroups = input.format === 4 ? 2 : 4;
  if (stage.groups.length !== expectedGroups) {
    return {
      error: `Für ${input.format} Teams werden genau ${expectedGroups} Gruppen benötigt.`,
      notice: null,
    };
  }

  const progress = isGroupStageComplete(stage.groups, stage.memberIdsByGroupId, stage.matches);
  if (!progress.complete && !input.forceIncomplete) {
    return {
      error: "Die Gruppenphase ist noch nicht vollständig abgeschlossen.",
      notice: null,
    };
  }

  const standingsByGroupId = Object.fromEntries(
    stage.groups.map((group) => [
      group.id,
      computeGroupStandings(
        stage.memberIdsByGroupId[group.id] ?? [],
        stage.matches.filter((match) => match.groupId === group.id && match.phase !== "knockout"),
      ),
    ]),
  );

  const qualified = qualifyTopTwo(stage.groups, standingsByGroupId);
  const options: KnockoutOptions = {
    format: input.format,
    includeThirdPlace: input.includeThirdPlace,
    includePlacement5: input.format === 8 && input.includePlacement5,
    includePlacement7: input.format === 8 && input.includePlacement7,
  };
  const plan = buildKnockoutPlan(options, qualified);
  if (plan.error) {
    return { error: plan.error, notice: null };
  }

  if (hasDuplicateTeamInRound(plan.matches.map((match) => ({
    round: match.round,
    homeApplicationId: match.homeId,
    awayApplicationId: match.awayId,
  })))) {
    return { error: "Ein Team würde in derselben KO-Runde doppelt spielen.", notice: null };
  }

  const fields = stage.fields;
  if (fields.length === 0) {
    return { error: "Bitte zuerst mindestens ein Spielfeld anlegen.", notice: null };
  }

  const ids = Object.fromEntries(plan.matches.map((match) => [match.key, crypto.randomUUID()]));
  const duration = loaded.tournament.match_duration_minutes ?? 12;
  const rest = loaded.tournament.minimum_rest_minutes ?? 15;
  const breakMinutes = loaded.tournament.break_minutes ?? 3;

  const groupTimes = stage.matches
    .filter((match) => match.phase !== "knockout" && match.scheduledAt)
    .map((match) => addMinutes(new Date(match.scheduledAt as string), match.durationMinutes).getTime());
  const defaultStart = groupTimes.length
    ? new Date(Math.max(...groupTimes) + rest * 60_000)
    : new Date();
  const start = input.startAt ? new Date(datetimeLocalToIso(input.startAt) ?? defaultStart) : defaultStart;

  const scheduled = new Map<string, { fieldId: string; scheduledAt: Date }>();
  let waveStart = start;
  for (const wave of KNOCKOUT_SCHEDULE_WAVES) {
    const items = plan.matches.filter((match) => wave.includes(match.round));
    if (items.length === 0) {
      continue;
    }
    const timetable = buildTimetable(
      items.map((match) => ({
        groupId: match.round,
        homeId: match.homeId ?? `tbd-h-${match.key}`,
        awayId: match.awayId ?? `tbd-a-${match.key}`,
      })),
      fields,
      {
        start: waveStart,
        durationMinutes: duration,
        breakMinutes,
        minimumRestMinutes: rest,
      },
    );
    for (const match of items) {
      const timed = timetable.matches.find(
        (item) =>
          item.homeId === (match.homeId ?? `tbd-h-${match.key}`) &&
          item.awayId === (match.awayId ?? `tbd-a-${match.key}`),
      );
      if (timed) {
        scheduled.set(match.key, { fieldId: timed.fieldId, scheduledAt: timed.scheduledAt });
      }
    }
    const lastTime = timetable.matches.reduce(
      (max, item) => Math.max(max, item.scheduledAt.getTime()),
      waveStart.getTime(),
    );
    waveStart = addMinutes(new Date(lastTime), duration + rest);
  }

  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from("tournament_matches")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("phase", "knockout");

  if (deleteError) {
    return {
      error: toUserFacingDbError("Bestehende KO-Spiele konnten nicht ersetzt werden.", deleteError),
      notice: null,
    };
  }

  const rows = plan.matches.map((match) => {
    const time = scheduled.get(match.key);
    return {
      id: ids[match.key],
      tournament_id: tournamentId,
      group_id: null,
      field_id: time?.fieldId ?? fields[0]?.id ?? null,
      home_application_id: match.homeId,
      away_application_id: match.awayId,
      scheduled_at: time?.scheduledAt.toISOString() ?? null,
      duration_minutes: duration,
      status: "scheduled" as const,
      phase: "knockout" as const,
      round: match.round,
      sort_order: match.sortOrder,
      decided_by: "regular" as const,
    };
  });

  const { error: insertError } = await supabase.from("tournament_matches").insert(rows);
  if (insertError) {
    return {
      error: toUserFacingDbError("Die KO-Runde konnte nicht erzeugt werden.", insertError),
      notice: null,
    };
  }

  const links = plan.matches.flatMap((match) => {
    const id = ids[match.key];
    if (!id) {
      return [];
    }
    return [{
      id,
      next_match_id: match.nextKey ? ids[match.nextKey] ?? null : null,
      next_match_slot: match.nextSlot,
      loser_next_match_id: match.loserNextKey ? ids[match.loserNextKey] ?? null : null,
      loser_next_match_slot: match.loserNextSlot,
    }];
  });

  for (const link of links) {
    const { error } = await supabase
      .from("tournament_matches")
      .update({
        next_match_id: link.next_match_id,
        next_match_slot: link.next_match_slot,
        loser_next_match_id: link.loser_next_match_id,
        loser_next_match_slot: link.loser_next_match_slot,
      })
      .eq("id", link.id)
      .eq("tournament_id", tournamentId);
    if (error) {
      return {
        error: toUserFacingDbError("Die KO-Verknüpfungen konnten nicht gespeichert werden.", error),
        notice: null,
      };
    }
  }

  revalidateStage(loaded.tournament);
  const notice = progress.complete
    ? `${plan.matches.length} KO-Spiele erzeugt.`
    : `${plan.matches.length} KO-Spiele erzeugt. Die Gruppenphase war noch nicht vollständig.`;
  return { error: null, notice };
}

export async function saveKnockoutMatchAction(
  tournamentId: string,
  input: {
    matchId: string;
    homeApplicationId: string;
    awayApplicationId: string;
    fieldId: string;
    scheduledAt: string;
    durationMinutes: string;
    confirmCompletedChange: boolean;
  },
): Promise<{ error: string | null }> {
  const access = await requireResultsManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  if (!input.homeApplicationId || !input.awayApplicationId) {
    return { error: "Bitte Heim- und Auswärtsteam wählen." };
  }
  if (input.homeApplicationId === input.awayApplicationId) {
    return { error: "Ein Team kann nicht gegen sich selbst spielen." };
  }

  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 90) {
    return { error: "Spielzeit muss zwischen 5 und 90 Minuten liegen." };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  const current = stage.matches.find((match) => match.id === input.matchId);
  if (!current || current.phase !== "knockout") {
    return { error: "Das KO-Spiel wurde nicht gefunden." };
  }

  const hasResult = current.status === "completed" || current.homeScore != null;
  if (hasResult && !input.confirmCompletedChange) {
    return {
      error: "Bestehende Ergebnisse oder Folgepaarungen können dadurch zurückgesetzt werden.",
    };
  }

  const nextMatches = stage.matches.map((match) =>
    match.id === input.matchId
      ? {
          ...match,
          homeApplicationId: input.homeApplicationId,
          awayApplicationId: input.awayApplicationId,
        }
      : match,
  );
  if (hasDuplicateTeamInRound(nextMatches.filter((match) => match.phase === "knockout"))) {
    return { error: "Ein Team darf in derselben KO-Runde nur einmal spielen." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_matches")
    .update({
      home_application_id: input.homeApplicationId,
      away_application_id: input.awayApplicationId,
      field_id: input.fieldId || null,
      scheduled_at: datetimeLocalToIso(input.scheduledAt),
      duration_minutes: durationMinutes,
      ...(hasResult
        ? {
            home_score: null,
            away_score: null,
            home_penalties: null,
            away_penalties: null,
            decided_by: "regular" as const,
            status: "scheduled" as const,
          }
        : {}),
    })
    .eq("id", input.matchId)
    .eq("tournament_id", tournamentId);

  if (error) {
    return { error: toUserFacingDbError("Das KO-Spiel konnte nicht gespeichert werden.", error) };
  }

  const refreshed = await getAdminTournamentStage(tournamentId);
  const propagateError = await persistPropagatedMatches(
    supabase,
    tournamentId,
    refreshed.matches,
  );
  if (propagateError) {
    return { error: propagateError };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function saveKnockoutResultAction(
  tournamentId: string,
  matchId: string,
  input: {
    homeScore: string;
    awayScore: string;
    decidedBy: DecidedBy;
    homePenalties: string;
    awayPenalties: string;
  },
): Promise<{ error: string | null }> {
  const access = await requireResultsManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const homeScore = parseScore(input.homeScore);
  const awayScore = parseScore(input.awayScore);
  if (homeScore == null || awayScore == null) {
    return { error: "Bitte gültige Tore (0–999) eintragen." };
  }

  const homePenalties =
    input.decidedBy === "penalties" ? parseScore(input.homePenalties) : null;
  const awayPenalties =
    input.decidedBy === "penalties" ? parseScore(input.awayPenalties) : null;

  const stage = await getAdminTournamentStage(tournamentId);
  const current = stage.matches.find((match) => match.id === matchId);
  if (!current || current.phase !== "knockout") {
    return { error: "Das KO-Spiel wurde nicht gefunden." };
  }

  const proposed = {
    ...current,
    homeScore,
    awayScore,
    status: "completed" as const,
    decidedBy: input.decidedBy,
    homePenalties,
    awayPenalties,
  };
  const outcome = resolveKnockoutOutcome(proposed);
  if (outcome.error || !outcome.winnerId) {
    return { error: outcome.error ?? "KO-Spiele brauchen einen eindeutigen Sieger." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournament_matches")
    .update({
      home_score: homeScore,
      away_score: awayScore,
      decided_by: input.decidedBy,
      home_penalties: homePenalties,
      away_penalties: awayPenalties,
      status: "completed",
    })
    .eq("id", matchId)
    .eq("tournament_id", tournamentId);

  if (error) {
    return { error: toUserFacingDbError("Das Ergebnis konnte nicht gespeichert werden.", error) };
  }

  const refreshed = await getAdminTournamentStage(tournamentId);
  const propagateError = await persistPropagatedMatches(
    supabase,
    tournamentId,
    refreshed.matches,
  );
  if (propagateError) {
    return { error: propagateError };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

export async function completeTournamentAction(
  tournamentId: string,
): Promise<{ error: string | null }> {
  const access = await requireResultsManage();
  if (access.error) {
    return { error: access.error };
  }

  const loaded = await loadTournament(tournamentId);
  if (!loaded.tournament) {
    return { error: loaded.error };
  }

  const stage = await getAdminTournamentStage(tournamentId);
  const finalMatch = stage.matches.find((match) => match.phase === "knockout" && match.round === "final");
  const outcome = finalMatch ? resolveKnockoutOutcome(finalMatch) : null;
  if (!finalMatch || !outcome?.winnerId) {
    return { error: "Das Finale muss zuerst mit einem eindeutigen Sieger abgeschlossen sein." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update({ status: "completed" })
    .eq("id", tournamentId);

  if (error) {
    return { error: toUserFacingDbError("Das Turnier konnte nicht abgeschlossen werden.", error) };
  }

  revalidateStage(loaded.tournament);
  return { error: null };
}

async function persistPropagatedMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string,
  matches: TournamentMatchRecord[],
): Promise<string | null> {
  const knockout = matches.filter((match) => match.phase === "knockout");
  const next = propagateKnockoutTeams(knockout);
  const previous = new Map(knockout.map((match) => [match.id, match]));

  for (const match of next) {
    const before = previous.get(match.id);
    if (!before) {
      continue;
    }
    const changed =
      before.homeApplicationId !== match.homeApplicationId ||
      before.awayApplicationId !== match.awayApplicationId ||
      before.status !== match.status ||
      before.homeScore !== match.homeScore ||
      before.awayScore !== match.awayScore ||
      before.homePenalties !== match.homePenalties ||
      before.awayPenalties !== match.awayPenalties ||
      before.decidedBy !== match.decidedBy;
    if (!changed) {
      continue;
    }

    const { error } = await supabase
      .from("tournament_matches")
      .update({
        home_application_id: match.homeApplicationId,
        away_application_id: match.awayApplicationId,
        status: match.status,
        home_score: match.homeScore,
        away_score: match.awayScore,
        home_penalties: match.homePenalties,
        away_penalties: match.awayPenalties,
        decided_by: match.decidedBy,
      })
      .eq("id", match.id)
      .eq("tournament_id", tournamentId);

    if (error) {
      return toUserFacingDbError("Die Folgepaarungen konnten nicht aktualisiert werden.", error);
    }
  }

  return null;
}
