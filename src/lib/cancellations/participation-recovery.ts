import { getEmailSiteUrl } from "@/lib/site";
import {
  generateSecureAccessToken,
  hashRateLimitIdentifier,
  hashSecureAccessToken,
  isValidSecureAccessTokenFormat,
} from "@/lib/cancellations/tokens";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PARTICIPATION_RECOVERY_NEUTRAL_NOTICE =
  "Wenn wir eine passende Teilnahme gefunden haben, senden wir einen sicheren Link an die bei der Bewerbung hinterlegte E-Mail-Adresse.";

export function normalizeParticipationRecoveryEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidParticipationRecoveryEmail(email: string) {
  const normalized = normalizeParticipationRecoveryEmail(email);
  return normalized.length >= 3 && EMAIL_PATTERN.test(normalized);
}

export function isValidParticipationRecoveryTournamentId(tournamentId: string) {
  return UUID_PATTERN.test(tournamentId.trim());
}

export function buildParticipationRecoveryRateLimitHashes(input: {
  contactEmail: string;
  clientIp?: string | null;
}) {
  const normalizedEmail = normalizeParticipationRecoveryEmail(input.contactEmail);
  const emailIdentifierHash = hashRateLimitIdentifier(
    `participation_recovery_email:${normalizedEmail}`,
  );
  const ip = input.clientIp?.trim();
  const ipIdentifierHash = ip
    ? hashRateLimitIdentifier(`participation_recovery_ip:${ip}`)
    : "";

  return {
    normalizedEmail,
    emailIdentifierHash,
    ipIdentifierHash,
  };
}

export function createParticipationRecoveryTokenMaterial() {
  const token = generateSecureAccessToken();
  return {
    token,
    tokenHash: hashSecureAccessToken(token),
    participationUrl: `${getEmailSiteUrl()}/teilnahme/${encodeURIComponent(token)}`,
  };
}

export function parseParticipationTokenFromUserInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    let pathname: string;

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const siteHost = new URL(getEmailSiteUrl()).host.toLowerCase();
      if (url.host.toLowerCase() !== siteHost) {
        return null;
      }

      pathname = url.pathname;
    } else if (trimmed.startsWith("/")) {
      pathname = trimmed.split("?")[0] ?? trimmed;
    } else {
      return null;
    }

    const match = pathname.match(/^\/teilnahme\/([^/]+)$/);
    const rawToken = match?.[1];
    if (!rawToken) {
      return null;
    }

    const token = decodeURIComponent(rawToken);
    if (!isValidSecureAccessTokenFormat(token)) {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}
