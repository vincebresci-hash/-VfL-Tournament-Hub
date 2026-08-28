import { createClient } from "@/lib/supabase/server";
import {
  secureAccessTokenExpiresAt,
} from "@/lib/cancellations/deadline";
import {
  generateSecureAccessToken,
  hashSecureAccessToken,
} from "@/lib/cancellations/tokens";
import { getSiteUrl } from "@/lib/site";

export function buildParticipationUrl(token: string) {
  return `${getSiteUrl()}/teilnahme/${encodeURIComponent(token)}`;
}

export async function ensureParticipationCancellationToken(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<string | null> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("secure_access_tokens")
    .select("id")
    .eq("application_id", input.applicationId)
    .eq("purpose", "cancellation")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return null;
  }

  const token = generateSecureAccessToken();
  const tokenHash = hashSecureAccessToken(token);
  const expiresAt = secureAccessTokenExpiresAt(input.tournamentDate);

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

export async function createParticipationCancellationTokenForAdmin(input: {
  applicationId: string;
  tournamentDate: string;
}): Promise<{ url: string | null; error: string | null }> {
  const token = generateSecureAccessToken();
  const tokenHash = hashSecureAccessToken(token);
  const expiresAt = secureAccessTokenExpiresAt(input.tournamentDate);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("secure_access_tokens")
    .select("id")
    .eq("application_id", input.applicationId)
    .eq("purpose", "cancellation")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    await supabase
      .from("secure_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { error } = await supabase.rpc("store_secure_access_token", {
    p_application_id: input.applicationId,
    p_purpose: "cancellation",
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error) {
    return {
      url: null,
      error: "Teilnahme-Link konnte nicht erstellt werden.",
    };
  }

  return { url: buildParticipationUrl(token), error: null };
}
