/**
 * Pure advisory / shared message helpers for safe empty-group deletion.
 * Server actions must re-verify with authoritative DB reads; UI must not be trusted.
 */

export const EMPTY_GROUP_DELETE_COMPLETED_MESSAGE =
  "Abgeschlossene Turniere können nicht verändert werden.";

export const EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE =
  "Gruppe enthält noch Mannschaften.";

export const EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE =
  "Gruppe hat bereits Spiele.";

export const EMPTY_GROUP_DELETE_NOT_FOUND_MESSAGE =
  "Die Gruppe wurde nicht gefunden.";

export type EmptyGroupDeletionFacts = {
  /** True when marketing status or effective lifecycle is completed. */
  tournamentCompleted: boolean;
  memberCount: number;
  /** Matches referencing this group id (any status / phase). */
  matchCountForGroup: number;
};

/**
 * Returns a German block reason, or null when advisory facts allow deletion.
 */
export function emptyGroupDeletionBlockReason(
  facts: EmptyGroupDeletionFacts,
): string | null {
  if (facts.tournamentCompleted) {
    return EMPTY_GROUP_DELETE_COMPLETED_MESSAGE;
  }
  if (facts.memberCount > 0) {
    return EMPTY_GROUP_DELETE_HAS_MEMBERS_MESSAGE;
  }
  if (facts.matchCountForGroup > 0) {
    return EMPTY_GROUP_DELETE_HAS_MATCHES_MESSAGE;
  }
  return null;
}

export function canAdviseEmptyGroupDeletion(facts: EmptyGroupDeletionFacts): boolean {
  return emptyGroupDeletionBlockReason(facts) === null;
}
