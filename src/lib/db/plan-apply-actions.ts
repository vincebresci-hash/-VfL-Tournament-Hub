"use server";

/**
 * C6-D/C6-E: Server-side preview → apply action.
 * Client may send only tournamentId + previewFingerprint + confirmReplace.
 * Persist only server-recomputed group schedule rows via shared persist core.
 *
 * Known limits (deferred): residual TOCTOU after validation; non-transactional DELETE+INSERT.
 */

import { requireScheduleManage } from "@/lib/rbac/action-access";
import { prepareTournamentPlanFromDb } from "@/lib/db/plan-preview-prepare";
import { persistPreparedGroupSchedule } from "@/lib/db/plan-schedule-persist";
import type { RegenerationPolicyResult } from "@/lib/schedule/plan-preview";

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

/**
 * Apply a previously reviewed C6-C plan preview.
 *
 * Mutation gate order:
 * 1. requireScheduleManage
 * 2. missing/invalid tournamentId or fingerprint
 * 3. server-authoritative prepare failure
 * 4. fingerprint mismatch → stale_preview
 * 5–9. shared persist core (C6-B, confirmation, fields, matches, map, DELETE/INSERT)
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

  const persisted = await persistPreparedGroupSchedule({
    tournamentId: id,
    tournament,
    stage,
    preview,
    policy,
    confirmReplace,
    successNotice: (count) => `${count} Gruppenspiele übernommen.`,
  });

  return result(persisted.status, persisted.error, {
    notice: persisted.notice,
    policy: persisted.policy,
    fingerprint: persisted.fingerprint,
  });
}
