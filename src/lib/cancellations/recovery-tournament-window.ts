import { secureAccessTokenExpiresAt } from "@/lib/cancellations/deadline";

/**
 * Tournament-level eligibility window for guest cancellation recovery.
 * Matches C2A RPC semantics:
 *   expires_at = (tournament.date::timestamptz UTC) + 30 days
 *   eligible when expires_at > now()
 *
 * Does not consider applications_open or tournaments.archived_at.
 */
export function isTournamentWithinGuestRecoveryWindow(
  tournamentDate: string | null | undefined,
  now = new Date(),
): boolean {
  if (!tournamentDate?.trim()) {
    return false;
  }

  const expiresAt = new Date(secureAccessTokenExpiresAt(tournamentDate.trim()));
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() > now.getTime();
}
