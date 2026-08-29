"use server";

import { createClient } from "@/lib/supabase/server";
import {
  hashSecureAccessToken,
  isValidSecureAccessTokenFormat,
} from "@/lib/cancellations/tokens";
import type { CommunicationReceiptView } from "@/types/communication";

export async function loadCommunicationReceiptByToken(
  token: string,
): Promise<CommunicationReceiptView | null> {
  if (!isValidSecureAccessTokenFormat(token)) {
    return null;
  }

  const supabase = await createClient();
  const tokenHash = hashSecureAccessToken(token);
  const { data, error } = await supabase.rpc("get_communication_receipt_context", {
    p_token_hash: tokenHash,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const row = data[0];
  if (!row.confirmation_required) {
    return null;
  }

  return {
    subject: row.subject,
    body: row.body,
    tournamentName: row.tournament_name,
    teamName: row.team_name,
    confirmedAt: row.confirmed_at,
  };
}

export async function confirmCommunicationReceiptAction(token: string): Promise<{
  error: string | null;
  confirmedAt: string | null;
  alreadyConfirmed: boolean;
}> {
  if (!isValidSecureAccessTokenFormat(token)) {
    return {
      error: "Dieser Bestätigungslink ist ungültig oder nicht mehr gültig.",
      confirmedAt: null,
      alreadyConfirmed: false,
    };
  }

  const supabase = await createClient();
  const tokenHash = hashSecureAccessToken(token);
  const { data, error } = await supabase.rpc("confirm_communication_receipt", {
    p_token_hash: tokenHash,
  });

  if (error || !data || data.length === 0) {
    return {
      error: "Dieser Bestätigungslink ist ungültig oder nicht mehr gültig.",
      confirmedAt: null,
      alreadyConfirmed: false,
    };
  }

  const row = data[0];
  return {
    error: null,
    confirmedAt: row.confirmed_at,
    alreadyConfirmed: row.already_confirmed,
  };
}
