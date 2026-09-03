import { parseTournamentDate } from "@/lib/cancellations/deadline";

export const PARTICIPATION_RECOVERY_TOKEN_VALIDITY_DAYS = 30;

/** Bounded minimum response time to reduce match/no-match timing skew (not constant-time). */
export const PARTICIPATION_RECOVERY_MIN_RESPONSE_MS = 500;

function utcMidnight(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function participationRecoveryTokenExpiresAt(
  tournamentDate: string | null,
  now = new Date(),
) {
  const reference = utcMidnight(now);
  if (tournamentDate) {
    const parsed = parseTournamentDate(tournamentDate);
    if (parsed && parsed.getTime() > reference.getTime()) {
      reference.setTime(parsed.getTime());
    }
  }

  const expires = new Date(reference.getTime());
  expires.setUTCDate(
    expires.getUTCDate() + PARTICIPATION_RECOVERY_TOKEN_VALIDITY_DAYS,
  );

  const minimumExpiry = new Date(now.getTime());
  minimumExpiry.setUTCDate(minimumExpiry.getUTCDate() + 1);

  return (expires > minimumExpiry ? expires : minimumExpiry).toISOString();
}

export async function waitForParticipationRecoveryResponseDeadline(
  startedAtMs: number,
  nowMs = Date.now(),
) {
  const elapsed = nowMs - startedAtMs;
  const remaining = PARTICIPATION_RECOVERY_MIN_RESPONSE_MS - elapsed;
  if (remaining <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, remaining);
  });
}
