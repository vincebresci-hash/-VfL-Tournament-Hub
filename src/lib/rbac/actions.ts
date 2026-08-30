"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, requireSuperAdminSession } from "@/lib/auth/guards";
import { toUserFacingDbError } from "@/lib/db/errors";
import { writeAdminAuditLog } from "@/lib/rbac/audit";
import { CLUB_ROLE_KEYS } from "@/lib/rbac/permissions";
import { deleteManagedUserRecords } from "@/lib/rbac/user-delete";
import type { RbacRoleKey } from "@/types/rbac";

function revalidateUserAdminPaths(userId?: string) {
  revalidatePath("/admin/benutzer");
  revalidatePath("/admin/rollen");
  if (userId) {
    revalidatePath(`/admin/benutzer/${userId}`);
  }
}

export async function setUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<{ error: string | null }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rbac_set_user_active", {
    p_user_id: userId,
    p_is_active: isActive,
  });

  if (error) {
    return {
      error: toUserFacingDbError("Der Benutzerstatus konnte nicht geändert werden.", error),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: userId,
    action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
  });

  revalidateUserAdminPaths(userId);
  return { error: null };
}

export async function assignUserRoleAction(input: {
  userId: string;
  roleKey: RbacRoleKey;
  clubId?: string | null;
}): Promise<{ error: string | null }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rbac_assign_user_role", {
    p_user_id: input.userId,
    p_role_key: input.roleKey,
    p_club_id: input.clubId ?? null,
  });

  if (error) {
    return {
      error: toUserFacingDbError("Die Rolle konnte nicht zugewiesen werden.", error),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: input.userId,
    action: "ROLE_ASSIGNED",
    metadata: { roleKey: input.roleKey, clubId: input.clubId ?? null },
  });

  revalidateUserAdminPaths(input.userId);
  return { error: null };
}

export async function revokeUserRoleAction(input: {
  userId: string;
  roleKey: RbacRoleKey;
  clubId?: string | null;
}): Promise<{ error: string | null }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rbac_revoke_user_role", {
    p_user_id: input.userId,
    p_role_key: input.roleKey,
    p_club_id: input.clubId ?? null,
  });

  if (error) {
    return {
      error: toUserFacingDbError("Die Rolle konnte nicht entfernt werden.", error),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: input.userId,
    action: "ROLE_REVOKED",
    metadata: { roleKey: input.roleKey, clubId: input.clubId ?? null },
  });

  revalidateUserAdminPaths(input.userId);
  return { error: null };
}

export async function assignTeamToUserAction(input: {
  userId: string;
  teamId: string;
}): Promise<{ error: string | null }> {
  const access = await requirePermission("teams.manage");
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rbac_assign_team", {
    p_user_id: input.userId,
    p_team_id: input.teamId,
  });

  if (error) {
    return {
      error: toUserFacingDbError("Das Team konnte nicht zugewiesen werden.", error),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: input.userId,
    action: "TEAM_ASSIGNED",
    metadata: { teamId: input.teamId },
  });

  revalidateUserAdminPaths(input.userId);
  return { error: null };
}

export async function revokeTeamFromUserAction(input: {
  userId: string;
  teamId: string;
}): Promise<{ error: string | null }> {
  const access = await requirePermission("teams.manage");
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rbac_revoke_team", {
    p_user_id: input.userId,
    p_team_id: input.teamId,
  });

  if (error) {
    return {
      error: toUserFacingDbError("Die Teamzuweisung konnte nicht entfernt werden.", error),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: input.userId,
    action: "TEAM_REVOKED",
    metadata: { teamId: input.teamId },
  });

  revalidateUserAdminPaths(input.userId);
  return { error: null };
}

export async function updateManagedUserProfileAction(input: {
  userId: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
}): Promise<{ error: string | null }> {
  const access = await requirePermission("users.manage");
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      display_name: input.displayName?.trim() || null,
      phone: input.phone?.trim() || null,
      job_title: input.jobTitle?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  if (error) {
    return {
      error: toUserFacingDbError("Das Benutzerprofil konnte nicht gespeichert werden.", error),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: input.userId,
    action: "PROFILE_UPDATED",
  });

  revalidateUserAdminPaths(input.userId);
  return { error: null };
}

export async function updateUserClubAssignmentAction(input: {
  userId: string;
  clubId: string | null;
}): Promise<{ error: string | null }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const supabase = await createClient();

  if (input.clubId) {
    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .select("id")
      .eq("id", input.clubId)
      .maybeSingle();
    if (clubError || !club) {
      return { error: "Der ausgewählte Verein wurde nicht gefunden." };
    }
  }

  const { data: userRoles } = await supabase
    .from("rbac_user_roles")
    .select("rbac_roles(key)")
    .eq("user_id", input.userId);

  const roleKeys = (userRoles ?? [])
    .map((row) => (row.rbac_roles as { key?: string } | null)?.key)
    .filter(Boolean) as RbacRoleKey[];

  if (roleKeys.some((key) => CLUB_ROLE_KEYS.includes(key)) && !input.clubId) {
    return { error: "Vereinsrollen erfordern eine Vereinszuordnung." };
  }

  const { data: teamRows } = await supabase
    .from("rbac_user_team_assignments")
    .select("team_id, teams(club_id)")
    .eq("user_id", input.userId);

  if (
    input.clubId &&
    (teamRows ?? []).some((row) => {
      const team = row.teams as { club_id?: string } | null;
      return team?.club_id && team.club_id !== input.clubId;
    })
  ) {
    return {
      error: "Der Benutzer ist Teams eines anderen Vereins zugeordnet. Bitte zuerst Teamzuweisungen entfernen.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      club_id: input.clubId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  if (error) {
    return {
      error: toUserFacingDbError("Die Vereinszuordnung konnte nicht gespeichert werden.", error),
    };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: input.userId,
    action: "CLUB_ASSIGNED",
    metadata: { clubId: input.clubId },
  });

  revalidateUserAdminPaths(input.userId);
  return { error: null };
}

export async function deleteManagedUserAction(
  userId: string,
): Promise<{ error: string | null }> {
  const access = await requireSuperAdminSession();
  if ("error" in access && access.error) {
    return { error: access.error };
  }
  if (!access.session) {
    return { error: "Bitte zuerst anmelden." };
  }

  const manageAccess = await requirePermission("users.manage");
  if ("error" in manageAccess && manageAccess.error) {
    return { error: manageAccess.error };
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { error: "Benutzer nicht gefunden." };
  }

  if (trimmedUserId === access.session.user.id) {
    return { error: "Du kannst dein eigenes Konto nicht löschen." };
  }

  const supabase = await createClient();
  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", trimmedUserId)
    .maybeSingle();

  if (targetProfileError) {
    return {
      error: toUserFacingDbError("Das Benutzerprofil konnte nicht geladen werden.", targetProfileError),
    };
  }

  if (!targetProfile) {
    return { error: "Benutzer nicht gefunden." };
  }

  if (targetProfile.role === "super-admin" && targetProfile.is_active) {
    const { data: activeSuperAdminCount, error: superAdminCountError } = await supabase.rpc(
      "count_active_super_admins",
      { p_exclude_user_id: trimmedUserId },
    );

    if (superAdminCountError) {
      return {
        error: toUserFacingDbError(
          "Der Super-Admin-Status konnte nicht geprüft werden.",
          superAdminCountError,
        ),
      };
    }

    if ((activeSuperAdminCount ?? 0) < 1) {
      return { error: "Der letzte aktive Super-Admin kann nicht gelöscht werden." };
    }
  }

  const result = await deleteManagedUserRecords(trimmedUserId);
  if (!result.ok) {
    return { error: result.error };
  }

  await writeAdminAuditLog({
    actorUserId: access.session.user.id,
    targetUserId: null,
    action: "USER_DELETED",
    metadata: { deletedUserId: trimmedUserId, email: result.email },
  });

  revalidateUserAdminPaths(trimmedUserId);
  return { error: null };
}
