/**
 * C6-E D1: Shared server-only group schedule persistence core.
 * Not a public server-action entrypoint — imported by Apply/Generate actions only.
 *
 * Callers must supply server-authoritative prepared structures only.
 * Browser-provided schedule rows/policy/fields are never accepted.
 *
 * Known limits (deferred): residual TOCTOU after validation; non-transactional DELETE+INSERT.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toUserFacingDbError } from "@/lib/db/errors";
import type { AdminTournamentStage } from "@/lib/db/schedule-queries";
import { getTournamentParticipants } from "@/lib/db/tournament-participants-queries";
import {
  matchSideDbColumns,
  resolveScheduleParticipantRef,
} from "@/lib/schedule/admin";
import {
  previewParticipantKey,
  type RegenerationPolicyResult,
  type TournamentPlanPreview,
} from "@/lib/schedule/plan-preview";

export type PersistGroupScheduleStatus =
  | "success"
  | "confirmation_required"
  | "blocked"
  | "validation_error"
  | "persistence_error";

export type PersistGroupScheduleResult = {
  status: PersistGroupScheduleStatus;
  error: string | null;
  notice: string | null;
  policy: RegenerationPolicyResult | null;
  fingerprint: string | null;
  persistedCount: number | null;
};

export type PersistPreparedGroupScheduleInput = {
  tournamentId: string;
  tournament: { id: string; slug: string };
  stage: AdminTournamentStage;
  preview: TournamentPlanPreview;
  policy: RegenerationPolicyResult;
  confirmReplace?: boolean;
  successNotice?: (count: number) => string;
};

function result(
  status: PersistGroupScheduleStatus,
  error: string | null,
  extras?: {
    notice?: string | null;
    policy?: RegenerationPolicyResult | null;
    fingerprint?: string | null;
    persistedCount?: number | null;
  },
): PersistGroupScheduleResult {
  return {
    status,
    error,
    notice: extras?.notice ?? null,
    policy: extras?.policy ?? null,
    fingerprint: extras?.fingerprint ?? null,
    persistedCount: extras?.persistedCount ?? null,
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
 * Persist a server-prepared group schedule.
 *
 * Gate order (all before DELETE):
 * 1. prepared input validation
 * 2. C6-B blocked
 * 3. confirmation_required (allowedWithConfirmation without confirmReplace)
 * 4. zero saved fields → validation_error (no auto-create)
 * 5. empty preview.matches → validation_error
 * 6. participant resolution + complete row construction
 * 7. DELETE phase=group
 * 8. INSERT rows
 * 9. revalidate
 */
export async function persistPreparedGroupSchedule(
  input: PersistPreparedGroupScheduleInput,
): Promise<PersistGroupScheduleResult> {
  const tournamentId = input.tournamentId.trim();
  if (
    !tournamentId ||
    !input.tournament?.id ||
    !input.tournament?.slug ||
    !input.stage ||
    !input.preview ||
    !input.policy
  ) {
    return result("validation_error", "Der Spielplan konnte nicht vorbereitet werden.");
  }

  const { tournament, stage, preview, policy } = input;
  const fingerprint = preview.inputFingerprint;

  // C6-B: blocked before confirmation; confirmReplace cannot bypass blocked.
  if (policy.decision === "blocked") {
    return result("blocked", policy.reason, { policy, fingerprint });
  }

  if (policy.decision === "allowedWithConfirmation" && input.confirmReplace !== true) {
    return result(
      "confirmation_required",
      "Es besteht bereits ein Spielplan ohne Ergebnisse. Bitte bestätige ausdrücklich, dass er ersetzt werden soll.",
      { policy, fingerprint },
    );
  }

  // Zero-field freeze: never auto-create a default field on persist.
  if (stage.fields.length === 0) {
    return result(
      "validation_error",
      "Bitte zuerst mindestens ein Spielfeld anlegen und speichern.",
      { policy, fingerprint },
    );
  }

  if (preview.matches.length === 0) {
    return result(
      "validation_error",
      "Es konnte kein Gruppenspielplan erzeugt werden. Bitte Gruppen, Teilnehmer und Einstellungen prüfen.",
      { policy, fingerprint },
    );
  }

  // Persistence source: server-recomputed preview.matches only (never client rows).
  const participants = await getTournamentParticipants(tournamentId);
  const rows = [];
  for (const match of preview.matches) {
    const homeId = previewParticipantKey(match.home);
    const awayId = previewParticipantKey(match.away);
    if (!homeId || !awayId || !match.scheduledAt) {
      return result(
        "validation_error",
        "Ein vorgeschlagenes Spiel ist unvollständig und kann nicht übernommen werden.",
        { policy, fingerprint },
      );
    }

    const homeRef = resolveScheduleParticipantRef(homeId, participants);
    const awayRef = resolveScheduleParticipantRef(awayId, participants);
    if (!homeRef || !awayRef) {
      return result(
        "validation_error",
        "Ein Spielplan-Team konnte keinem bestätigten Teilnehmer zugeordnet werden.",
        { policy, fingerprint },
      );
    }

    rows.push({
      tournament_id: tournamentId,
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
    .eq("tournament_id", tournamentId)
    .eq("phase", "group");

  if (deleteError) {
    return result(
      "persistence_error",
      constraintMessage(
        deleteError,
        "Der bestehende Spielplan konnte nicht ersetzt werden. Bitte lade den aktuellen Stand neu und prüfe den Spielplan.",
      ),
      { policy, fingerprint },
    );
  }

  const { error: insertError } = await supabase.from("tournament_matches").insert(rows);

  if (insertError) {
    return result(
      "persistence_error",
      constraintMessage(
        insertError,
        "Der Spielplan konnte nicht vollständig gespeichert werden. Bitte lade den aktuellen Stand neu und prüfe den Spielplan.",
      ),
      { policy, fingerprint },
    );
  }

  revalidateStage(tournament);
  const notice =
    input.successNotice?.(rows.length) ?? `${rows.length} Gruppenspiele übernommen.`;
  return result("success", null, {
    notice,
    policy,
    fingerprint,
    persistedCount: rows.length,
  });
}
