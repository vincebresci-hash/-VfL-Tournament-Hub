"use server";

import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildParticipationRecoveryRateLimitHashes,
  createParticipationRecoveryTokenMaterial,
  isValidParticipationRecoveryEmail,
  isValidParticipationRecoveryTournamentId,
  parseParticipationTokenFromUserInput,
  PARTICIPATION_RECOVERY_NEUTRAL_NOTICE,
} from "@/lib/cancellations/participation-recovery";
import { waitForParticipationRecoveryResponseDeadline } from "@/lib/cancellations/participation-recovery-timing";

export type ParticipationRecoveryActionResult = {
  error: string | null;
  notice: string | null;
  redirectPath?: string | null;
};

async function resolveClientIp() {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    const clientIp = forwarded.split(",")[0]?.trim();
    if (clientIp) {
      return clientIp;
    }
  }

  return headerStore.get("x-real-ip")?.trim() ?? null;
}

export async function requestParticipationAccessRecoveryAction(input: {
  tournamentId: string;
  contactEmail: string;
}): Promise<ParticipationRecoveryActionResult> {
  const startedAt = Date.now();
  const tournamentId = input.tournamentId.trim();
  const contactEmail = input.contactEmail.trim();

  if (!isValidParticipationRecoveryTournamentId(tournamentId)) {
    return { error: "Bitte wählt ein Turnier aus.", notice: null };
  }

  if (!isValidParticipationRecoveryEmail(contactEmail)) {
    return { error: "Bitte gebt eine gültige E-Mail-Adresse ein.", notice: null };
  }

  const clientIp = await resolveClientIp();
  const { normalizedEmail, emailIdentifierHash, ipIdentifierHash } =
    buildParticipationRecoveryRateLimitHashes({
      contactEmail,
      clientIp,
    });
  const { tokenHash, participationUrl } = createParticipationRecoveryTokenMaterial();

  try {
    const service = createServiceRoleClient();
    const { data, error } = await service.rpc("stage_participation_access_recovery_token", {
      p_tournament_id: tournamentId,
      p_contact_email: normalizedEmail,
      p_email_identifier_hash: emailIdentifierHash,
      p_ip_identifier_hash: ipIdentifierHash,
      p_token_hash: tokenHash,
    });

    if (error) {
      console.error("stage_participation_access_recovery_token failed", error.message);
    } else {
      const match = data?.[0];
      if (match?.application_id && match.contact_email) {
        const { scheduleParticipationRecoveryDelivery } = await import(
          "@/lib/cancellations/participation-recovery-delivery"
        );
        scheduleParticipationRecoveryDelivery({
          tokenHash,
          applicationId: match.application_id,
          toEmail: match.contact_email,
          contactFirstName: match.contact_first_name ?? "",
          tournamentName: match.tournament_name ?? "Turnier",
          participationUrl,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "recovery_unavailable";
    console.error("participation access recovery failed", message);
  }

  await waitForParticipationRecoveryResponseDeadline(startedAt);

  return {
    error: null,
    notice: PARTICIPATION_RECOVERY_NEUTRAL_NOTICE,
  };
}

export async function resolveExistingParticipationLinkAction(input: {
  link: string;
}): Promise<ParticipationRecoveryActionResult> {
  const token = parseParticipationTokenFromUserInput(input.link);
  if (!token) {
    return {
      error: "Bitte gebt einen gültigen Teilnahme-Link ein.",
      notice: null,
    };
  }

  return {
    error: null,
    notice: null,
    redirectPath: `/teilnahme/${encodeURIComponent(token)}`,
  };
}
