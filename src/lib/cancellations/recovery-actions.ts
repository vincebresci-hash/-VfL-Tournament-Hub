"use server";

import { headers } from "next/headers";
import {
  GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE,
} from "@/lib/cancellations/recovery-constants";
import { sendGuestCancellationRecoveryEmail } from "@/lib/cancellations/recovery-mail";
import {
  isNonEmptyRecoveryLabel,
  isValidRecoveryEmail,
  normalizeRecoveryEmail,
  normalizeRecoveryLabel,
} from "@/lib/cancellations/recovery-normalize";
import { buildParticipationUrl } from "@/lib/cancellations/participation-token";
import {
  generateSecureAccessToken,
  hashRateLimitIdentifier,
  hashSecureAccessToken,
} from "@/lib/cancellations/tokens";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type GuestCancellationRecoveryInput = {
  tournamentId: string;
  clubName: string;
  teamName: string;
  contactEmail: string;
  /** Honeypot — must be empty for humans. */
  honeypot?: string;
};

export type GuestCancellationRecoveryResult = {
  message: string;
};

type RecoveryRpcRow = {
  should_send: boolean | null;
  contact_email: string | null;
  contact_first_name: string | null;
  tournament_name: string | null;
  tournament_date: string | null;
  team_name: string | null;
  club_name: string | null;
};

function publicResult(): GuestCancellationRecoveryResult {
  return { message: GUEST_CANCELLATION_RECOVERY_PUBLIC_MESSAGE };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

async function resolveClientIpHash(): Promise<string | null> {
  try {
    const headerStore = await headers();
    const forwarded = headerStore.get("x-forwarded-for");
    const clientIp =
      forwarded?.split(",")[0]?.trim() ||
      headerStore.get("x-real-ip")?.trim() ||
      null;
    if (!clientIp) {
      return null;
    }

    return hashRateLimitIdentifier(`guest_cancellation_recovery_ip:${clientIp}`);
  } catch {
    return null;
  }
}

function logRecovery(outcome: string, detail?: string) {
  if (detail) {
    console.info(`[guest-cancellation-recovery] ${outcome}: ${detail}`);
    return;
  }

  console.info(`[guest-cancellation-recovery] ${outcome}`);
}

/**
 * Public guest cancellation recovery request.
 *
 * Always returns the same neutral message. Never creates cancellation_requests.
 * On exactly one eligible guest match, emails a /teilnahme/{token} link to the
 * stored applications.contact_email only.
 */
export async function requestGuestCancellationRecoveryAction(
  input: GuestCancellationRecoveryInput,
): Promise<GuestCancellationRecoveryResult> {
  const honeypot = input.honeypot?.trim() ?? "";
  if (honeypot) {
    logRecovery("honeypot");
    return publicResult();
  }

  const tournamentId = input.tournamentId?.trim() ?? "";
  const contactEmail = input.contactEmail ?? "";
  const clubName = input.clubName ?? "";
  const teamName = input.teamName ?? "";

  if (
    !isUuid(tournamentId) ||
    !isValidRecoveryEmail(contactEmail) ||
    !isNonEmptyRecoveryLabel(clubName) ||
    !isNonEmptyRecoveryLabel(teamName)
  ) {
    logRecovery("invalid_input");
    return publicResult();
  }

  const normalizedEmail = normalizeRecoveryEmail(contactEmail);
  const normalizedClub = normalizeRecoveryLabel(clubName);
  const normalizedTeam = normalizeRecoveryLabel(teamName);

  const plaintextToken = generateSecureAccessToken();
  const tokenHash = hashSecureAccessToken(plaintextToken);
  const emailIdentifierHash = hashRateLimitIdentifier(
    `guest_cancellation_recovery_email:${normalizedEmail}`,
  );
  const tournamentEmailIdentifierHash = hashRateLimitIdentifier(
    `guest_cancellation_recovery_tournament_email:${tournamentId}:${normalizedEmail}`,
  );
  const ipIdentifierHash = await resolveClientIpHash();

  let service;
  try {
    service = createServiceRoleClient();
  } catch (error) {
    logRecovery(
      "service_role_unavailable",
      error instanceof Error ? error.message : "unknown",
    );
    return publicResult();
  }

  const { data, error } = await service.rpc(
    "issue_guest_cancellation_recovery_token",
    {
      p_tournament_id: tournamentId,
      p_contact_email: normalizedEmail,
      p_club_name: normalizedClub,
      p_team_name: normalizedTeam,
      p_token_hash: tokenHash,
      p_email_identifier_hash: emailIdentifierHash,
      p_tournament_email_identifier_hash: tournamentEmailIdentifierHash,
      p_ip_identifier_hash: ipIdentifierHash,
    },
  );

  if (error) {
    logRecovery("rpc_error", error.message);
    return publicResult();
  }

  const row = (Array.isArray(data) ? data[0] : data) as RecoveryRpcRow | null;
  if (!row?.should_send || !row.contact_email?.trim()) {
    logRecovery("noop");
    return publicResult();
  }

  const storedEmail = row.contact_email.trim();
  // Defense in depth: only email the stored address; require normalized equality
  if (normalizeRecoveryEmail(storedEmail) !== normalizedEmail) {
    logRecovery("stored_email_mismatch");
    await service.rpc("revoke_secure_access_token_by_hash", {
      p_token_hash: tokenHash,
      p_purpose: "cancellation",
    });
    return publicResult();
  }

  const participationUrl = buildParticipationUrl(plaintextToken);
  const sendResult = await sendGuestCancellationRecoveryEmail({
    to: storedEmail,
    contactFirstName: row.contact_first_name,
    tournamentName: row.tournament_name,
    tournamentDate: row.tournament_date,
    teamName: row.team_name,
    clubName: row.club_name,
    participationUrl,
  });

  if (!sendResult.ok) {
    logRecovery(
      "email_failed_revoking_token",
      sendResult.error ?? (sendResult.skipped ? "skipped" : "send_failed"),
    );
    const { error: revokeError } = await service.rpc(
      "revoke_secure_access_token_by_hash",
      {
        p_token_hash: tokenHash,
        p_purpose: "cancellation",
      },
    );
    if (revokeError) {
      logRecovery("revoke_after_email_failure_failed", revokeError.message);
    }

    return publicResult();
  }

  logRecovery("email_sent");
  return publicResult();
}
