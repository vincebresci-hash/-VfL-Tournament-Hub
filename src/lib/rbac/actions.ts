"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, requireSuperAdminSession } from "@/lib/auth/guards";
import { toUserFacingDbError } from "@/lib/db/errors";
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
  clubId?: string | null;
}): Promise<{ error: string | null }> {
  const access = await requirePermission("users.manage");
  if ("error" in access && access.error) {
    return { error: access.error };
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
      club_id: input.clubId ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  if (error) {
    return {
      error: toUserFacingDbError("Das Benutzerprofil konnte nicht gespeichert werden.", error),
    };
  }

  revalidateUserAdminPaths(input.userId);
  return { error: null };
}
