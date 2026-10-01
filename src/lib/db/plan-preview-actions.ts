"use server";

/**
 * C6-C: Read-only Admin tournament plan preview action.
 * Zero mutation — SELECT/auth + pure plan-preview helpers only.
 * Persistence/apply remains C6-D (`plan-apply-actions.ts`).
 */

import { requireScheduleManage } from "@/lib/rbac/action-access";
import { prepareTournamentPlanFromDb } from "@/lib/db/plan-preview-prepare";
import type { RegenerationPolicyResult, TournamentPlanPreview } from "@/lib/schedule/plan-preview";

export type PreviewTournamentPlanActionResult = {
  preview: TournamentPlanPreview | null;
  policy: RegenerationPolicyResult | null;
  error: string | null;
};

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

  const prepared = await prepareTournamentPlanFromDb(id);
  if (prepared.error || !prepared.preview || !prepared.policy) {
    return {
      preview: null,
      policy: null,
      error: prepared.error ?? "Die Vorschau konnte nicht geladen werden.",
    };
  }

  return {
    preview: prepared.preview,
    policy: prepared.policy,
    error: null,
  };
}
