import { getSiteUrl } from "@/lib/site";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
} from "@/lib/cancellations/tokens";
import { secureAccessTokenExpiresAt } from "@/lib/cancellations/deadline";

export const COMMUNICATION_RECEIPT_TOKEN_PURPOSE = "communication_receipt" as const;

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

export function communicationReceiptTokenExpiresAt(
  tournamentDate: string | null,
  now = new Date(),
) {
  const minimumExpiry = new Date(now.getTime());
  minimumExpiry.setUTCDate(minimumExpiry.getUTCDate() + 1);

  const candidate = tournamentDate
    ? new Date(secureAccessTokenExpiresAt(tournamentDate))
    : (() => {
        const fallback = new Date(now.getTime());
        fallback.setUTCDate(fallback.getUTCDate() + 90);
        return fallback;
      })();

  const expires = candidate > minimumExpiry ? candidate : minimumExpiry;
  return expires.toISOString();
}

export function buildCommunicationReceiptEmailAppendix(confirmationUrl: string) {
  return `

Bitte bestätige den Erhalt dieser Information:
${confirmationUrl}

Die Bestätigung dokumentiert ausschließlich den Erhalt der Information.`;
}
