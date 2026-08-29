"use server";

import { revalidatePath } from "next/cache";
import { getInviteRedirectSiteUrl } from "@/lib/site";
import { requireSuperAdminSession } from "@/lib/auth/guards";
import { toUserFacingDbError } from "@/lib/db/errors";
import { isMissingRelationError } from "@/lib/db/errors";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAdminAuditLog } from "@/lib/rbac/audit";
import {
  buildInvitationRedirectUrl,
  logInvitationAuthFailure,
  resolveInvitationAuthUserMessage,
} from "@/lib/rbac/invitation-auth-errors";
import { CLUB_ROLE_KEYS, PLATFORM_ROLE_KEYS } from "@/lib/rbac/permissions";
import type { RbacRoleKey } from "@/types/rbac";

const INVITATION_TTL_DAYS = 7;
const RESEND_COOLDOWN_MS = 60_000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function revalidateInvitationPaths() {
  revalidatePath("/admin/benutzer");
}

async function getServiceClient() {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

async function hasEstablishedAuthUser(
  service: NonNullable<Awaited<ReturnType<typeof getServiceClient>>>,
  authUserId: string,
) {
  const { data: authUser } = await service.auth.admin.getUserById(authUserId);
  return Boolean(authUser.user?.last_sign_in_at);
}

async function cleanupPendingAuthUser(
  service: NonNullable<Awaited<ReturnType<typeof getServiceClient>>>,
  authUserId: string,
) {
  if (await hasEstablishedAuthUser(service, authUserId)) {
    return;
  }

  await service.auth.admin.deleteUser(authUserId);
}

export type InviteUserInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  clubId?: string | null;
  roleKeys: RbacRoleKey[];
  teamIds?: string[];
  personalMessage?: string | null;
};

export async function inviteUserAction(
  input: InviteUserInput,
): Promise<{ error: string | null; invitationId?: string }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { error: "Bitte eine gültige E-Mail-Adresse angeben." };
  }

  if (input.roleKeys.length === 0) {
    return { error: "Bitte mindestens eine Rolle auswählen." };
  }

  const service = await getServiceClient();
  if (!service) {
    return { error: "Einladungen sind derzeit nicht verfügbar (Service-Konfiguration)." };
  }

  const adminClient = await createClient();

  const needsClub = input.roleKeys.some((key) => CLUB_ROLE_KEYS.includes(key));
  if (needsClub && !input.clubId) {
    return { error: "Vereinsrollen erfordern eine Vereinszuordnung." };
  }

  if (input.clubId) {
    const { data: club, error: clubError } = await service
      .from("clubs")
      .select("id")
      .eq("id", input.clubId)
      .maybeSingle();
    if (clubError || !club) {
      return { error: "Der ausgewählte Verein wurde nicht gefunden." };
    }
  }

  const teamIds = input.teamIds ?? [];
  if (teamIds.length > 0) {
    const { data: teams, error: teamsError } = await service
      .from("teams")
      .select("id, club_id")
      .in("id", teamIds);
    if (teamsError || !teams || teams.length !== teamIds.length) {
      return { error: "Mindestens ein ausgewähltes Team wurde nicht gefunden." };
    }
    if (input.clubId && teams.some((team) => team.club_id !== input.clubId)) {
      return { error: "Ein Team gehört nicht zum ausgewählten Verein." };
    }
  }

  for (const roleKey of input.roleKeys) {
    if (![...PLATFORM_ROLE_KEYS, ...CLUB_ROLE_KEYS].includes(roleKey)) {
      return { error: `Unbekannte Rolle: ${roleKey}` };
    }
    if (CLUB_ROLE_KEYS.includes(roleKey) && !input.clubId) {
      return { error: `${roleKey} erfordert einen Verein.` };
    }
  }

  const { data: existingProfile, error: existingProfileError } = await service
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfileError) {
    return {
      error: toUserFacingDbError("Das Benutzerkonto konnte nicht geprüft werden.", existingProfileError),
    };
  }

  if (existingProfile) {
    return {
      error:
        "Für diese E-Mail existiert bereits ein Benutzerkonto. Bei einer fehlgeschlagenen Einladung bitte den bestehenden Eintrag in der Benutzerverwaltung prüfen.",
    };
  }

  const { data: pendingInvite, error: pendingInviteError } = await service
    .from("user_invitations")
    .select("id")
    .eq("status", "pending")
    .ilike("email", email)
    .maybeSingle();

  if (pendingInviteError) {
    return {
      error: toUserFacingDbError("Offene Einladungen konnten nicht geprüft werden.", pendingInviteError),
    };
  }

  if (pendingInvite) {
    return { error: "Für diese E-Mail liegt bereits eine offene Einladung vor." };
  }

  const siteUrl = getInviteRedirectSiteUrl();
  const redirectTo = buildInvitationRedirectUrl(siteUrl);

  const { data: inviteData, error: inviteError } = await service.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo,
      data: {
        first_name: input.firstName?.trim() ?? "",
        last_name: input.lastName?.trim() ?? "",
        display_name: input.displayName?.trim() ?? "",
      },
    },
  );

  if (inviteError || !inviteData.user) {
    const message = inviteError?.message ?? "";
    if (message.toLowerCase().includes("already")) {
      return { error: "Diese E-Mail ist bereits registriert." };
    }

    if (inviteError) {
      logInvitationAuthFailure("inviteUserAction", inviteError, redirectTo);
      return {
        error: resolveInvitationAuthUserMessage(inviteError, {
          fallback: "Die Einladung konnte nicht versendet werden.",
        }),
      };
    }

    return { error: "Die Einladung konnte nicht versendet werden." };
  }

  const userId = inviteData.user.id;
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const profileRole = input.roleKeys.some((key) => PLATFORM_ROLE_KEYS.includes(key))
    ? "admin"
    : "club";

  const { error: profileError } = await service
    .from("profiles")
    .update({
      first_name: input.firstName?.trim() || "",
      last_name: input.lastName?.trim() || "",
      display_name: input.displayName?.trim() || null,
      club_id: input.clubId ?? null,
      role: profileRole,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileError) {
    await cleanupPendingAuthUser(service, userId);
    return {
      error: toUserFacingDbError("Das Benutzerprofil konnte nicht vorbereitet werden.", profileError),
    };
  }

  for (const roleKey of input.roleKeys) {
    const { error: roleError } = await adminClient.rpc("rbac_assign_user_role", {
      p_user_id: userId,
      p_role_key: roleKey,
      p_club_id: CLUB_ROLE_KEYS.includes(roleKey) ? input.clubId ?? null : null,
    });
    if (roleError) {
      await cleanupPendingAuthUser(service, userId);
      return {
        error: toUserFacingDbError(`Rolle ${roleKey} konnte nicht zugewiesen werden.`, roleError),
      };
    }
  }

  for (const teamId of teamIds) {
    const { error: teamError } = await adminClient.rpc("rbac_assign_team", {
      p_user_id: userId,
      p_team_id: teamId,
    });
    if (teamError) {
      await cleanupPendingAuthUser(service, userId);
      return {
        error: toUserFacingDbError("Teamzuweisung fehlgeschlagen.", teamError),
      };
    }
  }

  const metadata = {
    roleKeys: input.roleKeys,
    clubId: input.clubId ?? null,
    teamIds,
    personalMessage: input.personalMessage?.trim() || null,
  };

  const { data: invitation, error: invitationError } = await service
    .from("user_invitations")
    .insert({
      email,
      invited_by: access.session.user.id,
      expires_at: expiresAt,
      status: "pending",
      auth_user_id: userId,
      profile_id: userId,
      metadata,
    })
    .select("id")
    .single();

  if (invitationError) {
    await cleanupPendingAuthUser(service, userId);
    if (isMissingRelationError(invitationError)) {
      return { error: "Einladungstabelle fehlt. Bitte PR28-Migration ausführen." };
    }
    return {
      error: toUserFacingDbError("Die Einladung konnte nicht protokolliert werden.", invitationError),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: userId,
    action: "USER_INVITED",
    metadata: { email, invitationId: invitation.id },
  });

  revalidateInvitationPaths();
  return { error: null, invitationId: invitation.id };
}

export async function resendInvitationAction(
  invitationId: string,
): Promise<{ error: string | null }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const service = await getServiceClient();
  if (!service) {
    return { error: "Einladungen sind derzeit nicht verfügbar." };
  }

  const { data: invitation, error: loadError } = await service
    .from("user_invitations")
    .select("id, email, status, last_sent_at, auth_user_id, profile_id")
    .eq("id", invitationId)
    .maybeSingle();

  if (loadError || !invitation) {
    return { error: "Einladung nicht gefunden." };
  }

  if (invitation.status !== "pending") {
    return { error: "Nur ausstehende Einladungen können erneut gesendet werden." };
  }

  const lastSent = new Date(invitation.last_sent_at).getTime();
  if (Date.now() - lastSent < RESEND_COOLDOWN_MS) {
    return { error: "Bitte eine Minute warten, bevor die Einladung erneut gesendet wird." };
  }

  if (invitation.profile_id && invitation.auth_user_id) {
    if (await hasEstablishedAuthUser(service, invitation.auth_user_id)) {
      return { error: "Der Benutzer hat die Einladung bereits angenommen." };
    }
  }

  const siteUrl = getInviteRedirectSiteUrl();
  const redirectTo = buildInvitationRedirectUrl(siteUrl);

  const { error: resendError } = await service.auth.admin.inviteUserByEmail(invitation.email, {
    redirectTo,
  });

  if (resendError) {
    logInvitationAuthFailure("resendInvitationAction", resendError, redirectTo);
    return {
      error: resolveInvitationAuthUserMessage(resendError, {
        fallback: "Die Einladung konnte nicht erneut gesendet werden.",
      }),
    };
  }

  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await service
    .from("user_invitations")
    .update({
      last_sent_at: new Date().toISOString(),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId);

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: invitation.profile_id,
    action: "INVITATION_RESENT",
    metadata: { invitationId },
  });

  revalidateInvitationPaths();
  return { error: null };
}

export async function cancelInvitationAction(
  invitationId: string,
): Promise<{ error: string | null }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const service = await getServiceClient();
  if (!service) {
    return { error: "Einladungen sind derzeit nicht verfügbar." };
  }

  const { data: invitation, error: loadError } = await service
    .from("user_invitations")
    .select("id, status, auth_user_id, profile_id")
    .eq("id", invitationId)
    .maybeSingle();

  if (loadError || !invitation) {
    return { error: "Einladung nicht gefunden." };
  }

  if (invitation.status !== "pending") {
    return { error: "Nur ausstehende Einladungen können abgebrochen werden." };
  }

  if (invitation.auth_user_id && (await hasEstablishedAuthUser(service, invitation.auth_user_id))) {
    return { error: "Der Benutzer hat die Einladung bereits angenommen." };
  }

  const { data: cancelled, error: cancelError } = await service
    .from("user_invitations")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId)
    .eq("status", "pending")
    .select("auth_user_id, profile_id")
    .maybeSingle();

  if (cancelError || !cancelled) {
    return { error: "Die Einladung ist nicht mehr ausstehend oder wurde bereits bearbeitet." };
  }

  if (cancelled.auth_user_id) {
    if (await hasEstablishedAuthUser(service, cancelled.auth_user_id)) {
      return { error: "Der Benutzer hat die Einladung bereits angenommen." };
    }

    const { error: deleteError } = await service.auth.admin.deleteUser(cancelled.auth_user_id);
    if (deleteError) {
      return {
        error: toUserFacingDbError(
          "Die Einladung wurde storniert, aber der Auth-Benutzer konnte nicht entfernt werden.",
          deleteError,
        ),
      };
    }
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: cancelled.profile_id,
    action: "INVITATION_CANCELLED",
    metadata: { invitationId },
  });

  revalidateInvitationPaths();
  return { error: null };
}
