import { requireAdminSession } from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { hasAnyPlatformPermission } from "@/lib/rbac/permissions";
import type { Permission } from "@/types/rbac";

function isPlatformTeamDirectoryUser(
  roleKeys: string[],
  profileRole: "club" | "admin" | "super-admin",
) {
  return (
    profileRole === "super-admin" ||
    profileRole === "admin" ||
    hasAnyPlatformPermission(roleKeys as never)
  );
}

export async function getCommunicationTeamDirectoryAccess() {
  const adminAccess = await requireAdminSession();
  if ("error" in adminAccess && adminAccess.error) {
    return { canUseTeamDirectorySource: false };
  }

  if (!adminAccess.session || !adminAccess.authorization) {
    return { canUseTeamDirectorySource: false };
  }

  const isPlatform = isPlatformTeamDirectoryUser(
    adminAccess.authorization.roleKeys,
    adminAccess.session.user.role,
  );
  const permissions = new Set(adminAccess.authorization.permissions ?? []);

  const hasTeamsView =
    canManageSystem(adminAccess.session.user.role) || permissions.has("teams.view");
  const hasCommunicationsView =
    canManageSystem(adminAccess.session.user.role) ||
    permissions.has("communications.view");

  return {
    canUseTeamDirectorySource: isPlatform && hasTeamsView && hasCommunicationsView,
  };
}

export function hasCommunicationTeamDirectoryPermission(
  permissions: Set<Permission>,
  roleKeys: string[],
  profileRole: "club" | "admin" | "super-admin",
) {
  return (
    isPlatformTeamDirectoryUser(roleKeys, profileRole) &&
    permissions.has("teams.view") &&
    permissions.has("communications.view")
  );
}
