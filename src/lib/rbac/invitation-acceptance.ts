import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { redactInvitationSecrets } from "@/lib/rbac/invitation-auth-errors";

export type InvitationAcceptanceOutcome =
  | "accepted"
  | "already_accepted"
  | "missing_email"
  | "service_unavailable"
  | "lookup_failed"
  | "not_found"
  | "email_mismatch"
  | "update_failed"
  | "no_rows_updated";

export type InvitationAcceptanceResult = {
  outcome: InvitationAcceptanceOutcome;
  invitationId?: string;
  lookupStrategy?: "profile_id" | "auth_user_id" | "email";
  updatedRows?: number;
  errorCode?: string;
  errorMessage?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function logInvitationAcceptance(
  level: "error" | "warn" | "info",
  message: string,
  details: Record<string, unknown>,
) {
  const payload = {
    scope: "invitation_acceptance",
    message,
    ...details,
  };

  if (level === "error") {
    console.error("[invitation_acceptance]", payload);
    return;
  }

  if (level === "warn") {
    console.warn("[invitation_acceptance]", payload);
    return;
  }

  console.info("[invitation_acceptance]", payload);
}

async function findPendingInvitation(
  service: ReturnType<typeof createServiceRoleClient>,
  input: { userId: string; normalizedEmail: string },
) {
  const byProfileId = await service
    .from("user_invitations")
    .select("id, email, status, profile_id, auth_user_id")
    .eq("profile_id", input.userId)
    .eq("status", "pending")
    .maybeSingle();

  if (byProfileId.error) {
    return { invitation: null, lookupError: byProfileId.error, lookupStrategy: null };
  }

  if (byProfileId.data) {
    return {
      invitation: byProfileId.data,
      lookupError: null,
      lookupStrategy: "profile_id" as const,
    };
  }

  const byAuthUserId = await service
    .from("user_invitations")
    .select("id, email, status, profile_id, auth_user_id")
    .eq("auth_user_id", input.userId)
    .eq("status", "pending")
    .maybeSingle();

  if (byAuthUserId.error) {
    return { invitation: null, lookupError: byAuthUserId.error, lookupStrategy: null };
  }

  if (byAuthUserId.data) {
    return {
      invitation: byAuthUserId.data,
      lookupError: null,
      lookupStrategy: "auth_user_id" as const,
    };
  }

  const byEmail = await service
    .from("user_invitations")
    .select("id, email, status, profile_id, auth_user_id")
    .eq("status", "pending")
    .ilike("email", input.normalizedEmail)
    .maybeSingle();

  if (byEmail.error) {
    return { invitation: null, lookupError: byEmail.error, lookupStrategy: null };
  }

  if (byEmail.data) {
    return {
      invitation: byEmail.data,
      lookupError: null,
      lookupStrategy: "email" as const,
    };
  }

  return { invitation: null, lookupError: null, lookupStrategy: null };
}

export async function markInvitationAcceptedForAuthUser(input: {
  userId: string;
  email: string | undefined;
  source?: string;
}): Promise<InvitationAcceptanceResult> {
  const source = input.source ?? "unknown";

  if (!input.email?.trim()) {
    logInvitationAcceptance("warn", "missing auth email", {
      source,
      userId: input.userId,
      outcome: "missing_email",
    });
    return { outcome: "missing_email" };
  }

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "service_role_unavailable";
    logInvitationAcceptance("error", "service role client unavailable", {
      source,
      userId: input.userId,
      outcome: "service_unavailable",
      errorMessage: redactInvitationSecrets(message),
    });
    return {
      outcome: "service_unavailable",
      errorMessage: message,
    };
  }

  const normalizedEmail = normalizeEmail(input.email);
  const { invitation, lookupError, lookupStrategy } = await findPendingInvitation(service, {
    userId: input.userId,
    normalizedEmail,
  });

  if (lookupError) {
    logInvitationAcceptance("error", "pending invitation lookup failed", {
      source,
      userId: input.userId,
      outcome: "lookup_failed",
      errorCode: lookupError.code,
      errorMessage: redactInvitationSecrets(lookupError.message),
    });
    return {
      outcome: "lookup_failed",
      errorCode: lookupError.code,
      errorMessage: lookupError.message,
    };
  }

  if (!invitation) {
    logInvitationAcceptance("info", "no pending invitation found", {
      source,
      userId: input.userId,
      outcome: "not_found",
    });
    return { outcome: "not_found" };
  }

  if (normalizeEmail(invitation.email) !== normalizedEmail) {
    logInvitationAcceptance("warn", "invitation email mismatch", {
      source,
      userId: input.userId,
      invitationId: invitation.id,
      lookupStrategy,
      outcome: "email_mismatch",
    });
    return {
      outcome: "email_mismatch",
      invitationId: invitation.id,
      lookupStrategy: lookupStrategy ?? undefined,
    };
  }

  const { data: updatedRows, error: updateError } = await service
    .from("user_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    logInvitationAcceptance("error", "invitation accept update failed", {
      source,
      userId: input.userId,
      invitationId: invitation.id,
      lookupStrategy,
      outcome: "update_failed",
      errorCode: updateError.code,
      errorMessage: redactInvitationSecrets(updateError.message),
    });
    return {
      outcome: "update_failed",
      invitationId: invitation.id,
      lookupStrategy: lookupStrategy ?? undefined,
      errorCode: updateError.code,
      errorMessage: updateError.message,
    };
  }

  const affected = updatedRows?.length ?? 0;
  if (affected === 0) {
    logInvitationAcceptance("warn", "invitation accept update affected zero rows", {
      source,
      userId: input.userId,
      invitationId: invitation.id,
      lookupStrategy,
      outcome: "no_rows_updated",
    });
    return {
      outcome: "no_rows_updated",
      invitationId: invitation.id,
      lookupStrategy: lookupStrategy ?? undefined,
      updatedRows: 0,
    };
  }

  logInvitationAcceptance("info", "invitation accepted", {
    source,
    userId: input.userId,
    invitationId: invitation.id,
    lookupStrategy,
    outcome: "accepted",
    updatedRows: affected,
  });

  return {
    outcome: "accepted",
    invitationId: invitation.id,
    lookupStrategy: lookupStrategy ?? undefined,
    updatedRows: affected,
  };
}
