/**
 * C6-H D3 — Thin server view-model for admin lifecycle chrome.
 * Reuses D2 loadTournamentLifecycleSnapshot; no second lifecycle algorithm.
 */

import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { loadTournamentLifecycleSnapshot } from "@/lib/db/tournament-lifecycle";
import {
  TOURNAMENT_LIFECYCLE_DESCRIPTION_DE,
  TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT,
  TOURNAMENT_LIFECYCLE_LABEL_DE,
  tournamentLifecycleLabelDe,
} from "@/lib/schedule/tournament-lifecycle-labels";
import type { TournamentLifecycleState } from "@/lib/schedule/tournament-lifecycle";

export type AdminLifecyclePanelModel = {
  effective: TournamentLifecycleState;
  label: string;
  description: string;
  correctionHint: string | null;
  completionEligible: boolean;
  canReopen: boolean;
  groupsHref: string;
  knockoutHref: string;
  completionReadinessText: string | null;
};

export async function getAdminLifecyclePanelModel(
  tournamentId: string,
): Promise<{ model: AdminLifecyclePanelModel | null; error: string | null }> {
  const loaded = await loadTournamentLifecycleSnapshot(tournamentId, {
    includeCompletionEligible: true,
  });
  if (loaded.error || !loaded.snapshot) {
    return { model: null, error: loaded.error };
  }

  const adminAccess = await requireAdminSession();
  const canResultsManage =
    !("error" in adminAccess && adminAccess.error) &&
    adminAccess.session !== null &&
    adminAccess.authorization !== null &&
    (canManageSystem(adminAccess.session.user.role) ||
      hasPermissionInAuthorization(
        adminAccess.authorization,
        adminAccess.session,
        "results.manage",
      ));

  const { snapshot } = loaded;
  const effective = snapshot.effective;
  const base = `/admin/turniere/${tournamentId}`;

  let completionReadinessText: string | null = null;
  if (effective === "knockout_stage") {
    completionReadinessText = snapshot.facts.completionEligible
      ? "Das Finale hat einen Sieger. Das Turnier kann abgeschlossen werden."
      : "Abschluss möglich, sobald das Finale einen eindeutigen Sieger hat.";
  }

  return {
    model: {
      effective,
      label: tournamentLifecycleLabelDe(effective),
      description: TOURNAMENT_LIFECYCLE_DESCRIPTION_DE[effective],
      correctionHint:
        effective === "knockout_stage"
          ? TOURNAMENT_LIFECYCLE_KO_CORRECTION_HINT
          : null,
      completionEligible: snapshot.facts.completionEligible,
      canReopen: effective === "completed" && canResultsManage,
      groupsHref: `${base}/gruppen`,
      knockoutHref: `${base}/ko-runde`,
      completionReadinessText,
    },
    error: null,
  };
}

export { TOURNAMENT_LIFECYCLE_LABEL_DE };
