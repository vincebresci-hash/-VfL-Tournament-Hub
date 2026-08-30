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

async function revokeActiveParticipationTokens(applicationId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("secure_access_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("application_id", applicationId)
    .eq("purpose", "cancellation")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.error("revoke participation token failed", error.message);
  }
}

async function issueParticipationCancellationToken(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<string | null> {
  const token = generateSecureAccessToken();
  const tokenHash = hashSecureAccessToken(token);
  const expiresAt = secureAccessTokenExpiresAt(input.tournamentDate);
  const supabase = await createClient();

  const { error } = await supabase.rpc("store_secure_access_token", {
    p_application_id: input.applicationId,
    p_purpose: "cancellation",
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error) {
    console.error("store_secure_access_token failed", error.message);
    return null;
  }

  return buildParticipationUrl(token);
}

export async function ensureParticipationCancellationToken(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<string | null> {
  await revokeActiveParticipationTokens(input.applicationId);
  return issueParticipationCancellationToken(input);
}

export async function createParticipationCancellationTokenForAdmin(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<{ url: string | null; error: string | null }> {
  await revokeActiveParticipationTokens(input.applicationId);
  const url = await issueParticipationCancellationToken(input);

  if (!url) {
    return {
      url: null,
      error: "Teilnahme-Link konnte nicht erstellt werden.",
    };
  }

  return { url, error: null };
}
