/**
 * CL Release 6.1 — P0 guard against repeated pairings in the league/group phase.
 *
 * Pure, ID-based (never display names). Two teams may meet at most once within
 * the league phase; swapping home/away is NOT a new pairing. Self-play is never
 * allowed. The KNOCKOUT phase is explicitly exempt: KO rematches are permitted
 * and are governed by the bracket, not by this guard.
 *
 * This is the manual-edit / manual-add enforcement. Generation, preview, the
 * editable-preview re-validation and the apply RPC enforce the same invariant on
 * their own paths.
 */

export const LEAGUE_DUPLICATE_PAIRING_MESSAGE =
  "Diese Begegnung ist bereits im Spielplan vorhanden. Zwei Mannschaften dürfen in der Ligaphase nur einmal gegeneinander spielen.";

export const LEAGUE_SELF_PLAY_MESSAGE =
  "Eine Mannschaft kann nicht gegen sich selbst spielen.";

export type PairingGuardMatch = {
  id: string;
  phase?: string | null;
  homeId: string | null;
  awayId: string | null;
};

/** Unordered, ID-based pairing key. Swapping home/away yields the same key. */
export function pairingKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** True when the pairing is a team against itself (ID-based). */
export function isSelfPairing(homeId: string, awayId: string): boolean {
  return homeId === awayId;
}

/**
 * The id of an existing NON-KNOCKOUT match that already has the same unordered
 * pairing, or null. The match being edited (excludeMatchId) is ignored so a
 * no-op save of an unchanged pairing is allowed. Knockout matches never count.
 */
export function findDuplicateLeaguePairing(input: {
  matches: readonly PairingGuardMatch[];
  homeId: string;
  awayId: string;
  excludeMatchId?: string | null;
}): string | null {
  const target = pairingKey(input.homeId, input.awayId);
  for (const match of input.matches) {
    if (match.phase === "knockout") {
      continue;
    }
    if (input.excludeMatchId && match.id === input.excludeMatchId) {
      continue;
    }
    if (!match.homeId || !match.awayId) {
      continue;
    }
    if (pairingKey(match.homeId, match.awayId) === target) {
      return match.id;
    }
  }
  return null;
}
