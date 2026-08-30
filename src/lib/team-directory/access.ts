import { canManageSystem } from "@/lib/auth/roles";
import { requireAdminSession } from "@/lib/auth/guards";
import { hasAnyPlatformPermission } from "@/lib/rbac/permissions";
import { redirect } from "next/navigation";
import { ADMIN_HOME } from "@/lib/auth/roles";
import { requirePagePermission } from "@/lib/rbac/page-access";

export function isPlatformTeamDirectoryUser(
  roleKeys: string[],
  profileRole: "club" | "admin" | "super-admin",
) {
  return (
    profileRole === "super-admin" ||
    profileRole === "admin" ||
    hasAnyPlatformPermission(roleKeys as never)
  );
}

export async function requirePlatformTeamDirectoryPage() {
  await requirePagePermission("teams.view");

  const adminAccess = await requireAdminSession();
  if ("error" in adminAccess && adminAccess.error) {
    redirect(ADMIN_HOME);
  }

  if (!adminAccess.session || !adminAccess.authorization) {
    redirect(ADMIN_HOME);
  }

  if (
    !canManageSystem(adminAccess.session.user.role) &&
    !isPlatformTeamDirectoryUser(
      adminAccess.authorization.roleKeys,
      adminAccess.session.user.role,
    )
  ) {
    redirect(ADMIN_HOME);
  }
}

export async function getTeamDirectoryAccessFlags() {
  const adminAccess = await requireAdminSession();
  if ("error" in adminAccess && adminAccess.error) {
    return { canView: false, canManage: false };
  }

  if (!adminAccess.session || !adminAccess.authorization) {
    return { canView: false, canManage: false };
  }

  const isPlatform = isPlatformTeamDirectoryUser(
    adminAccess.authorization.roleKeys,
    adminAccess.session.user.role,
  );

  const permissions = new Set(adminAccess.authorization.permissions ?? []);

  return {
    canView:
      isPlatform &&
      (canManageSystem(adminAccess.session.user.role) || permissions.has("teams.view")),
    canManage:
      isPlatform &&
      (canManageSystem(adminAccess.session.user.role) || permissions.has("teams.manage")),
  };
}
