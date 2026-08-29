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

export function communicationReceiptTokenExpiresAt(tournamentDate: string | null) {
  if (tournamentDate) {
    return secureAccessTokenExpiresAt(tournamentDate);
  }

  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + 90);
  return expires.toISOString();
}

export function buildCommunicationReceiptEmailAppendix(confirmationUrl: string) {
  return `

Bitte bestätige den Erhalt dieser Information:
${confirmationUrl}

Die Bestätigung dokumentiert ausschließlich den Erhalt der Information.`;
}
