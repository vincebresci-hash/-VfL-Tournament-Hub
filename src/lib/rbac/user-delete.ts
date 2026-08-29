import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { redactInvitationSecrets } from "@/lib/rbac/invitation-auth-errors";
import { toUserFacingDbError } from "@/lib/db/errors";
import {
  deleteManagedAvatarIfOwned,
  isManagedAvatarUrl,
} from "@/lib/storage/avatars";

export type DeleteManagedUserResult =
  | { ok: true; email: string | null }
  | { ok: false; error: string; logMessage?: string };

function logUserDeleteFailure(scope: string, details: Record<string, unknown>) {
  console.error(`[${scope}]`, {
    scope: "user_delete",
    ...details,
  });
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

export async function deleteManagedUserRecords(userId: string): Promise<DeleteManagedUserResult> {
  let service;
  try {
    service = createServiceRoleClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "service_role_unavailable";
    logUserDeleteFailure("deleteManagedUserRecords", {
      userId,
      step: "service_client",
      errorMessage: redactInvitationSecrets(message),
    });
    return {
      ok: false,
      error: "Benutzer konnte nicht gelöscht werden (Service-Konfiguration).",
      logMessage: message,
    };
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, email, role, is_active, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    logUserDeleteFailure("deleteManagedUserRecords", {
      userId,
      step: "load_profile",
      errorCode: profileError.code,
      errorMessage: redactInvitationSecrets(profileError.message),
    });
    return {
      ok: false,
      error: toUserFacingDbError("Das Benutzerprofil konnte nicht geladen werden.", profileError),
      logMessage: profileError.message,
    };
  }

  if (!profile) {
    return { ok: false, error: "Benutzer nicht gefunden." };
  }

  const normalizedEmail = normalizeEmail(profile.email);

  const { error: invitationByUserError } = await service
    .from("user_invitations")
    .delete()
    .or(`profile_id.eq.${userId},auth_user_id.eq.${userId}`);

  if (invitationByUserError) {
    logUserDeleteFailure("deleteManagedUserRecords", {
      userId,
      step: "delete_invitations_by_user",
      errorCode: invitationByUserError.code,
      errorMessage: redactInvitationSecrets(invitationByUserError.message),
    });
    return {
      ok: false,
      error: toUserFacingDbError("Die Benutzereinladungen konnten nicht entfernt werden.", invitationByUserError),
      logMessage: invitationByUserError.message,
    };
  }

  if (normalizedEmail) {
    const { error: invitationByEmailError } = await service
      .from("user_invitations")
      .delete()
      .ilike("email", normalizedEmail);

    if (invitationByEmailError) {
      logUserDeleteFailure("deleteManagedUserRecords", {
        userId,
        step: "delete_invitations_by_email",
        errorCode: invitationByEmailError.code,
        errorMessage: redactInvitationSecrets(invitationByEmailError.message),
      });
      return {
        ok: false,
        error: toUserFacingDbError(
          "Die Benutzereinladungen konnten nicht entfernt werden.",
          invitationByEmailError,
        ),
        logMessage: invitationByEmailError.message,
      };
    }
  }

  const { error: permissionOverridesError } = await service
    .from("rbac_user_permission_overrides")
    .delete()
    .eq("user_id", userId);

  if (permissionOverridesError) {
    logUserDeleteFailure("deleteManagedUserRecords", {
      userId,
      step: "delete_permission_overrides",
      errorCode: permissionOverridesError.code,
      errorMessage: redactInvitationSecrets(permissionOverridesError.message),
    });
    return {
      ok: false,
      error: toUserFacingDbError(
        "Die Berechtigungsüberschreibungen konnten nicht entfernt werden.",
        permissionOverridesError,
      ),
      logMessage: permissionOverridesError.message,
    };
  }

  const { error: teamAssignmentsError } = await service
    .from("rbac_user_team_assignments")
    .delete()
    .eq("user_id", userId);

  if (teamAssignmentsError) {
    logUserDeleteFailure("deleteManagedUserRecords", {
      userId,
      step: "delete_team_assignments",
      errorCode: teamAssignmentsError.code,
      errorMessage: redactInvitationSecrets(teamAssignmentsError.message),
    });
    return {
      ok: false,
      error: toUserFacingDbError("Die Teamzuordnungen konnten nicht entfernt werden.", teamAssignmentsError),
      logMessage: teamAssignmentsError.message,
    };
  }

  const { error: roleAssignmentsError } = await service
    .from("rbac_user_roles")
    .delete()
    .eq("user_id", userId);

  if (roleAssignmentsError) {
    logUserDeleteFailure("deleteManagedUserRecords", {
      userId,
      step: "delete_role_assignments",
      errorCode: roleAssignmentsError.code,
      errorMessage: redactInvitationSecrets(roleAssignmentsError.message),
    });
    return {
      ok: false,
      error: toUserFacingDbError("Die Rollenzuordnungen konnten nicht entfernt werden.", roleAssignmentsError),
      logMessage: roleAssignmentsError.message,
    };
  }

  if (isManagedAvatarUrl(profile.avatar_url)) {
    try {
      await deleteManagedAvatarIfOwned({
        supabase: service,
        avatarUrl: profile.avatar_url,
        userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "avatar_delete_failed";
      logUserDeleteFailure("deleteManagedUserRecords", {
        userId,
        step: "delete_avatar",
        errorMessage: redactInvitationSecrets(message),
      });
      return {
        ok: false,
        error: "Das Profilbild konnte nicht entfernt werden.",
        logMessage: message,
      };
    }
  }

  const { error: authDeleteError } = await service.auth.admin.deleteUser(userId);

  if (authDeleteError) {
    logUserDeleteFailure("deleteManagedUserRecords", {
      userId,
      step: "delete_auth_user",
      errorMessage: redactInvitationSecrets(authDeleteError.message),
    });
    return {
      ok: false,
      error: toUserFacingDbError("Der Auth-Benutzer konnte nicht gelöscht werden.", authDeleteError),
      logMessage: authDeleteError.message,
    };
  }

  const { data: remainingProfile } = await service
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (remainingProfile) {
    const { error: profileDeleteError } = await service.from("profiles").delete().eq("id", userId);
    if (profileDeleteError) {
      logUserDeleteFailure("deleteManagedUserRecords", {
        userId,
        step: "delete_profile_fallback",
        errorCode: profileDeleteError.code,
        errorMessage: redactInvitationSecrets(profileDeleteError.message),
      });
      return {
        ok: false,
        error: toUserFacingDbError("Das Benutzerprofil konnte nicht entfernt werden.", profileDeleteError),
        logMessage: profileDeleteError.message,
      };
    }
  }

  return { ok: true, email: profile.email };
}
