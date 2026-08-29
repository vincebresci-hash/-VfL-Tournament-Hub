"use server";

import { revalidatePath } from "next/cache";
import { getSiteUrl } from "@/lib/site";
import { requireSuperAdminSession } from "@/lib/auth/guards";
import { toUserFacingDbError } from "@/lib/db/errors";
import { isMissingRelationError } from "@/lib/db/errors";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAdminAuditLog } from "@/lib/rbac/audit";
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

  const { data: existingProfile } = await service
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (existingProfile) {
    return { error: "Für diese E-Mail existiert bereits ein Benutzerkonto." };
  }

  const { data: pendingInvite } = await service
    .from("user_invitations")
    .select("id")
    .eq("status", "pending")
    .ilike("email", email)
    .maybeSingle();

  if (pendingInvite) {
    return { error: "Für diese E-Mail liegt bereits eine offene Einladung vor." };
  }

  const siteUrl = getSiteUrl();
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent("/verein/dashboard")}`;

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
    return {
      error: toUserFacingDbError("Die Einladung konnte nicht versendet werden.", inviteError),
    };
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

  if (invitation.profile_id) {
    const { data: profile } = await service
      .from("profiles")
      .select("is_active")
      .eq("id", invitation.profile_id)
      .maybeSingle();
    if (profile?.is_active && invitation.auth_user_id) {
      const { data: authUser } = await service.auth.admin.getUserById(invitation.auth_user_id);
      if (authUser.user?.last_sign_in_at) {
        return { error: "Der Benutzer hat die Einladung bereits angenommen." };
      }
    }
  }

  const siteUrl = getSiteUrl();
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent("/verein/dashboard")}`;

  const { error: resendError } = await service.auth.admin.inviteUserByEmail(invitation.email, {
    redirectTo,
  });

  if (resendError) {
    return {
      error: toUserFacingDbError("Die Einladung konnte nicht erneut gesendet werden.", resendError),
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

  if (invitation.auth_user_id) {
    const { data: authUser } = await service.auth.admin.getUserById(invitation.auth_user_id);
    if (authUser.user?.last_sign_in_at) {
      return { error: "Der Benutzer hat die Einladung bereits angenommen." };
    }
  }

  await service
    .from("user_invitations")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId);

  if (invitation.auth_user_id) {
    await service.auth.admin.deleteUser(invitation.auth_user_id);
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: invitation.profile_id,
    action: "INVITATION_CANCELLED",
    metadata: { invitationId },
  });

  revalidateInvitationPaths();
  return { error: null };
}

export async function markInvitationAcceptedAction(userId: string) {
  const service = await getServiceClient();
  if (!service) {
    return;
  }

  await service
    .from("user_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", userId)
    .eq("status", "pending");
}
