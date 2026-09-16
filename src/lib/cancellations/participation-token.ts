import { createClient } from "@/lib/supabase/server";
import { secureAccessTokenExpiresAt } from "@/lib/cancellations/deadline";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
} from "@/lib/cancellations/tokens";
import { getEmailSiteUrl } from "@/lib/site";

export function buildParticipationUrl(token: string) {
  return `${getEmailSiteUrl()}/teilnahme/${encodeURIComponent(token)}`;
}

/**
 * Atomically revoke prior active cancellation tokens and issue a replacement.
 * Serialization uses applications FOR UPDATE inside rotate_participation_cancellation_token
 * (same lock as recovery stage/activate).
 */
async function issueParticipationCancellationToken(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<string | null> {
  const token = generateSecureAccessToken();
  const tokenHash = hashSecureAccessToken(token);
  const expiresAt = secureAccessTokenExpiresAt(input.tournamentDate);
  const supabase = await createClient();

  const { error } = await supabase.rpc("rotate_participation_cancellation_token", {
    p_application_id: input.applicationId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error) {
    console.error("rotate_participation_cancellation_token failed", error.message);
    return null;
  }

  return buildParticipationUrl(token);
}

export async function ensureParticipationCancellationToken(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<string | null> {
  return issueParticipationCancellationToken(input);
}

export async function createParticipationCancellationTokenForAdmin(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<{ url: string | null; error: string | null }> {
  const url = await issueParticipationCancellationToken(input);

  if (!url) {
    return {
      url: null,
      error: "Teilnahme-Link konnte nicht erstellt werden.",
    };
  }

  return { url, error: null };
}
