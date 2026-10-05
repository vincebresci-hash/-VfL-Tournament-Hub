/**
 * C6-F D1 — Post-KO group-result freeze policy (pure).
 *
 * Reuses C6-B KO_STARTED semantics for knockout presence:
 * ANY match with phase === "knockout" locks group-standing mutations.
 * Match status does not matter (scheduled/live/completed/cancelled/placeholder).
 *
 * Intentionally separate from the full group-schedule regeneration policy:
 * RESULTS_EXIST / LIVE must not block group-result editing before KO exists.
 */

export const GROUP_RESULT_LOCKED_BY_KNOCKOUT = "GROUP_RESULT_LOCKED_BY_KNOCKOUT" as const;

export const GROUP_RESULT_LOCKED_MESSAGE =
  "Gruppenergebnisse sind gesperrt, da die K.-o.-Phase bereits erstellt wurde.";

export type GroupResultLockReason = "knockout_exists";

export type GroupResultLockMatch = {
  phase?: string | null;
};

export type GroupResultLockPolicy = {
  allowed: boolean;
  reason: GroupResultLockReason | null;
  code: typeof GROUP_RESULT_LOCKED_BY_KNOCKOUT | null;
  message: string | null;
};

/** True when any row has phase === "knockout" (status ignored). */
export function hasKnockoutPhase(matches: readonly GroupResultLockMatch[]): boolean {
  return matches.some((match) => match.phase === "knockout");
}

/**
 * Whether group-standing-affecting mutations are allowed.
 * Locked iff ANY knockout-phase match exists.
 */
export function canMutateGroupResults(
  matches: readonly GroupResultLockMatch[],
): GroupResultLockPolicy {
  if (hasKnockoutPhase(matches)) {
    return {
      allowed: false,
      reason: "knockout_exists",
      code: GROUP_RESULT_LOCKED_BY_KNOCKOUT,
      message: GROUP_RESULT_LOCKED_MESSAGE,
    };
  }

  return {
    allowed: true,
    reason: null,
    code: null,
    message: null,
  };
}
