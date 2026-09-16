import "server-only";

import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deliverParticipationAccessRecoveryEmail } from "@/lib/cancellations/participation-recovery-mail";

type RecoveryDeliveryInput = {
  tokenHash: string;
  applicationId: string;
  toEmail: string;
  contactFirstName: string;
  tournamentName: string;
  participationUrl: string;
};

async function finalizeStagedParticipationRecovery(input: RecoveryDeliveryInput) {
  const service = createServiceRoleClient();
  const emailResult = await deliverParticipationAccessRecoveryEmail({
    applicationId: input.applicationId,
    toEmail: input.toEmail,
    contactFirstName: input.contactFirstName,
    tournamentName: input.tournamentName,
    participationUrl: input.participationUrl,
  });

  if (emailResult.ok) {
    const { error } = await service.rpc("activate_participation_access_recovery_token", {
      p_token_hash: input.tokenHash,
    });

    if (error) {
      console.error("activate_participation_access_recovery_token failed", error.message);
      await service.rpc("discard_participation_access_recovery_token", {
        p_token_hash: input.tokenHash,
      });
    }

    return;
  }

  const { error } = await service.rpc("discard_participation_access_recovery_token", {
    p_token_hash: input.tokenHash,
  });

  if (error) {
    console.error("discard_participation_access_recovery_token failed", error.message);
  }
}

export function scheduleParticipationRecoveryDelivery(input: RecoveryDeliveryInput) {
  after(async () => {
    try {
      await finalizeStagedParticipationRecovery(input);
    } catch (deliveryError) {
      const message =
        deliveryError instanceof Error
          ? deliveryError.message
          : "participation_recovery_delivery_failed";
      console.error("participation recovery delivery failed", message);
    }
  });
}
