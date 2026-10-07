/**
 * Pure participant-management policy helpers (Aus Gruppe / Teilnehmer entfernen).
 * Fail-closed when any match exists — intentionally stricter than C6-B SCHEDULE_NO_RESULTS.
 */

export const PARTICIPANT_MATCH_GATE_MESSAGE =
  "Teilnehmer und Gruppenzuordnungen können nicht geändert werden, solange Spiele existieren. Bitte zuerst den Spielplan löschen oder neu generieren.";

export const PARTICIPANT_COMPLETED_GATE_MESSAGE =
  "Teilnehmer und Gruppenzuordnungen können in einem abgeschlossenen Turnier nicht geändert werden.";

export const PARTICIPANT_MEMBERSHIP_MISSING_MESSAGE =
  "Keine Gruppenzuordnung für diesen Teilnehmer vorhanden.";

export const PARTICIPANT_MEMBERSHIP_CLEANUP_FAILED_MESSAGE =
  "Die Gruppenzuordnung konnte nicht entfernt werden. Der Teilnehmerstatus wurde nicht geändert.";

export const PARTICIPANT_NOT_FOUND_MESSAGE = "Das Team wurde in diesem Turnier nicht gefunden.";

/**
 * Result of ownership-scoped membership cleanup.
 * Exit transitions may proceed only when verifiedAbsent is true and error is null.
 */
export type MembershipCleanupResult = {
  error: string | null;
  /** True when membership row(s) existed before the cleanup attempt. */
  hadMembership: boolean;
  /**
   * True when a post-cleanup authoritative reread finds no ownership-scoped membership.
   * Must not be inferred from pre-delete counts or DELETE error === null alone.
   */
  verifiedAbsent: boolean;
};

/**
 * A) no membership before → verifiedAbsent, exit may proceed
 * B) membership remained after DELETE → blocked
 * C) membership existed and verified gone → exit may proceed
 */
export function canProceedParticipantExitAfterMembershipCleanup(
  result: Pick<MembershipCleanupResult, "error" | "verifiedAbsent">,
): boolean {
  return result.error == null && result.verifiedAbsent === true;
}

export type ParticipantMembershipMutationGateInput = {
  matchCount: number;
  tournamentStatus?: string | null;
};

export type ParticipantMembershipMutationGateResult = {
  allowed: boolean;
  reason: string | null;
};

/** Authoritative gate for Aus Gruppe entfernen / Teilnehmer entfernen. */
export function canMutateParticipantMembership(
  input: ParticipantMembershipMutationGateInput,
): ParticipantMembershipMutationGateResult {
  if (typeof input.matchCount !== "number" || !Number.isFinite(input.matchCount) || input.matchCount < 0) {
    return {
      allowed: false,
      reason: "Spielplan-Daten sind unvollständig oder ungültig.",
    };
  }

  if (input.tournamentStatus === "completed") {
    return {
      allowed: false,
      reason: PARTICIPANT_COMPLETED_GATE_MESSAGE,
    };
  }

  if (input.matchCount > 0) {
    return {
      allowed: false,
      reason: PARTICIPANT_MATCH_GATE_MESSAGE,
    };
  }

  return { allowed: true, reason: null };
}

export type ParticipantExitSource = "application" | "mein-turnierplan" | "manual";

export type ParticipantExitTransition = {
  source: ParticipantExitSource;
  /** Field mutated on the preserved row */
  field: "status" | "participation_status" | "external_active";
  from: string | boolean;
  to: string | boolean;
  preservesRow: true;
  deletesRow: false;
};

/** Existing domain exit semantics — no new statuses, no hard delete. */
export function resolveParticipantExitTransition(
  source: ParticipantExitSource,
): ParticipantExitTransition {
  if (source === "application") {
    return {
      source: "application",
      field: "status",
      from: "accepted",
      to: "rejected",
      preservesRow: true,
      deletesRow: false,
    };
  }
  if (source === "manual") {
    return {
      source: "manual",
      field: "external_active",
      from: true,
      to: false,
      preservesRow: true,
      deletesRow: false,
    };
  }
  return {
    source: "mein-turnierplan",
    field: "participation_status",
    from: "confirmed",
    to: "rejected",
    preservesRow: true,
    deletesRow: false,
  };
}

/**
 * Membership-first ordering for confirmed-participant exit.
 * Step labels are stable for structural regression checks.
 */
export const PARTICIPANT_EXIT_ORDER = [
  "auth",
  "validate_tournament",
  "load_matches",
  "match_gate",
  "delete_group_membership",
  "apply_exit_transition",
  "revalidate",
] as const;

export type ParticipantExitOrderStep = (typeof PARTICIPANT_EXIT_ORDER)[number];

export function membershipFirstIndex(): number {
  return PARTICIPANT_EXIT_ORDER.indexOf("delete_group_membership");
}

export function exitTransitionIndex(): number {
  return PARTICIPANT_EXIT_ORDER.indexOf("apply_exit_transition");
}

/** Map C6-B-style stage facts onto the stricter participant match gate. */
export function participantGateFromStageFacts(input: {
  tournamentStatus?: string | null;
  matches: Array<{ phase?: string | null; status?: string | null }>;
}): ParticipantMembershipMutationGateResult {
  return canMutateParticipantMembership({
    matchCount: input.matches.length,
    tournamentStatus: input.tournamentStatus,
  });
}
