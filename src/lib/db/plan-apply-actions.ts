"use server";

/**
 * C6-D D1: Server-side preview → apply foundation.
 * Client may send only tournamentId + previewFingerprint + confirmReplace.
 * Persist only server-recomputed group schedule rows.
 *
 * Known limits (deferred): residual TOCTOU after validation; non-transactional DELETE+INSERT.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireScheduleManage } from "@/lib/rbac/action-access";
import { toUserFacingDbError } from "@/lib/db/errors";
import { prepareTournamentPlanFromDb } from "@/lib/db/plan-preview-prepare";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import {
  matchSideDbColumns,
  resolveScheduleParticipantRef,
} from "@/lib/schedule/admin";
import {
  previewParticipantKey,
  type RegenerationPolicyResult,
} from "@/lib/schedule/plan-preview";

export type ApplyTournamentPlanStatus =
  | "success"
  | "stale_preview"
  | "confirmation_required"
  | "blocked"
  | "validation_error"
  | "persistence_error";

export type ApplyTournamentPlanActionResult = {
  status: ApplyTournamentPlanStatus;
  error: string | null;
  notice: string | null;
  policy: RegenerationPolicyResult | null;
  fingerprint: string | null;
};

function result(
  status: ApplyTournamentPlanStatus,
  error: string | null,
  extras?: {
    notice?: string | null;
    policy?: RegenerationPolicyResult | null;
    fingerprint?: string | null;
  },
): ApplyTournamentPlanActionResult {
  return {
    status,
    error,
    notice: extras?.notice ?? null,
    policy: extras?.policy ?? null,
    fingerprint: extras?.fingerprint ?? null,
  };
}

function revalidateStage(tournament: { id: string; slug: string }) {
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

function constraintMessage(error: { code?: string; message?: string } | null, fallback: string) {
  return toUserFacingDbError(fallback, error);
}

/**
 * Apply a previously reviewed C6-C plan preview.
 *
 * Mutation gate order (all before DELETE):
 * 1. requireScheduleManage
 * 2. missing/invalid tournamentId or fingerprint
 * 3. server-authoritative prepare failure
 * 4. fingerprint mismatch → stale_preview
 * 5. C6-B blocked → blocked
 * 6. allowedWithConfirmation without confirmReplace === true → confirmation_required
 * 7. zero fields → validation_error (no auto-create)
 * 8. empty/non-computable group timetable → validation_error
 * 9. persistence (DELETE phase=group, INSERT server-recomputed rows)
 */
export async function applyTournamentPlanAction(
  tournamentId: string,
  previewFingerprint: string,
  confirmReplace?: boolean,
): Promise<ApplyTournamentPlanActionResult> {
  const access = await requireScheduleManage();
  if (access.error) {
    return result("validation_error", access.error);
  }

  const id = tournamentId.trim();
  if (!id) {
    return result("validation_error", "Turnier-ID fehlt.");
  }

  const clientFingerprint = previewFingerprint.trim();
  if (!clientFingerprint) {
    return result("validation_error", "Vorschau-Fingerprint fehlt.");
  }

  // Server-authoritative re-read + recompute preview/policy (same mapping as C6-C).
  const prepared = await prepareTournamentPlanFromDb(id);
  if (
    prepared.error ||
    !prepared.tournament ||
    !prepared.stage ||
    !prepared.preview ||
    !prepared.policy
  ) {
    return result(
      "validation_error",
      prepared.error ?? "Der Spielplan konnte nicht vorbereitet werden.",
    );
  }

  const { tournament, stage, preview, policy } = prepared;
  const currentFingerprint = preview.inputFingerprint;

  if (currentFingerprint !== clientFingerprint) {
    return result(
      "stale_preview",
      "Die Turnierdaten haben sich seit der Vorschau geändert. Bitte aktualisiere die Vorschau und prüfe den Spielplan erneut.",
      { policy, fingerprint: currentFingerprint },
    );
  }

  if (policy.decision === "blocked") {
    return result("blocked", policy.reason, {
      policy,
      fingerprint: currentFingerprint,
    });
  }

  if (policy.decision === "allowedWithConfirmation" && confirmReplace !== true) {
    return result(
      "confirmation_required",
      "Es besteht bereits ein Spielplan ohne Ergebnisse. Bitte bestätige ausdrücklich, dass er ersetzt werden soll.",
      { policy, fingerprint: currentFingerprint },
    );
  }

  // Zero-field freeze: never auto-create a default field on apply.
  if (stage.fields.length === 0) {
    return result(
      "validation_error",
      "Bitte zuerst mindestens ein Spielfeld anlegen und die Vorschau erneut prüfen.",
      { policy, fingerprint: currentFingerprint },
    );
  }

  if (preview.matches.length === 0) {
    return result(
      "validation_error",
      "Es konnte kein Gruppenspielplan erzeugt werden. Bitte Gruppen, Teilnehmer und Einstellungen prüfen.",
      { policy, fingerprint: currentFingerprint },
    );
  }

  // Persistence source: server-recomputed preview.matches only (never client rows).
  const participants = await getTournamentParticipants(id);
  const rows = [];
  for (const match of preview.matches) {
    const homeId = previewParticipantKey(match.home);
    const awayId = previewParticipantKey(match.away);
    if (!homeId || !awayId || !match.scheduledAt) {
      return result(
        "validation_error",
        "Ein vorgeschlagenes Spiel ist unvollständig und kann nicht übernommen werden.",
        { policy, fingerprint: currentFingerprint },
      );
    }

    const homeRef = resolveScheduleParticipantRef(homeId, participants);
    const awayRef = resolveScheduleParticipantRef(awayId, participants);
    if (!homeRef || !awayRef) {
      return result(
        "validation_error",
        "Ein Spielplan-Team konnte keinem bestätigten Teilnehmer zugeordnet werden.",
        { policy, fingerprint: currentFingerprint },
      );
    }

    rows.push({
      tournament_id: id,
      group_id: match.groupKey,
      field_id: match.fieldId,
      ...matchSideDbColumns("home", homeRef),
      ...matchSideDbColumns("away", awayRef),
      scheduled_at: match.scheduledAt,
      duration_minutes: match.durationMinutes,
      status: "scheduled" as const,
      phase: "group" as const,
      sort_order: match.sortOrder,
    });
  }

  const supabase = await createClient();

  // Strict group-phase scope only. Residual TOCTOU after earlier policy read is deferred.
  const { error: deleteError } = await supabase
    .from("tournament_matches")
    .delete()
    .eq("tournament_id", id)
    .eq("phase", "group");

  if (deleteError) {
    return result(
      "persistence_error",
      constraintMessage(
        deleteError,
        "Der bestehende Spielplan konnte nicht ersetzt werden.",
      ),
      { policy, fingerprint: currentFingerprint },
    );
  }

  const { error: insertError } = await supabase.from("tournament_matches").insert(rows);

  if (insertError) {
    return result(
      "persistence_error",
      constraintMessage(insertError, "Der Spielplan konnte nicht gespeichert werden."),
      { policy, fingerprint: currentFingerprint },
    );
  }

  revalidateStage(tournament);
  return result("success", null, {
    notice: `${rows.length} Gruppenspiele übernommen.`,
    policy,
    fingerprint: currentFingerprint,
  });
}
