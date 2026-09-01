import { getSiteUrl } from "@/lib/site";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
} from "@/lib/cancellations/tokens";
import { parseTournamentDate } from "@/lib/cancellations/deadline";

export const COMMUNICATION_RECEIPT_TOKEN_PURPOSE = "communication_receipt" as const;

/** Receipt links expire this many days after the reference date (tournament or today). */
export const COMMUNICATION_RECEIPT_TOKEN_VALIDITY_DAYS = 30;

function utcMidnight(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function communicationReceiptTokenExpiresAt(
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
    expires.getUTCDate() + COMMUNICATION_RECEIPT_TOKEN_VALIDITY_DAYS,
  );

  const minimumExpiry = new Date(now.getTime());
  minimumExpiry.setUTCDate(minimumExpiry.getUTCDate() + 1);

  return (expires > minimumExpiry ? expires : minimumExpiry).toISOString();
}

export function buildCommunicationReceiptUrl(token: string) {
  return `${getSiteUrl()}/mitteilung/${encodeURIComponent(token)}`;
}

export function createCommunicationReceiptTokenPair() {
  const token = generateSecureAccessToken();
  return {
    token,
    tokenHash: hashSecureAccessToken(token),
  };
}

export function buildCommunicationReceiptEmailAppendix(confirmationUrl: string) {
  return `

Bitte bestätige den Erhalt dieser Information:
${confirmationUrl}

Die Bestätigung dokumentiert ausschließlich den Erhalt der Information.`;
}
