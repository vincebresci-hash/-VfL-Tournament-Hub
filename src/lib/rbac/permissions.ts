import type { Permission, RbacRoleKey } from "@/types/rbac";
import { RBAC_PERMISSIONS } from "@/types/rbac";

export const PLATFORM_ROLE_KEYS: RbacRoleKey[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "TOURNAMENT_MANAGER",
  "APPLICATION_MANAGER",
  "FINANCE_MANAGER",
  "COMMUNICATION_MANAGER",
];

export const CLUB_ROLE_KEYS: RbacRoleKey[] = ["CLUB_ADMIN", "TEAM_MANAGER"];

export const ROLE_PERMISSIONS: Record<RbacRoleKey, readonly Permission[]> = {
  SUPER_ADMIN: RBAC_PERMISSIONS,
  ADMIN: RBAC_PERMISSIONS.filter((permission) => permission !== "roles.manage"),
  TOURNAMENT_MANAGER: [
    "tournaments.view",
    "tournaments.manage",
    "schedule.view",
    "schedule.manage",
    "results.view",
    "results.manage",
  ],
  APPLICATION_MANAGER: [
    "applications.view",
    "applications.manage",
    "applications.decide",
    "cancellations.view",
    "cancellations.decide",
    "cancellations.manage",
  ],
  FINANCE_MANAGER: ["payments.view", "payments.manage"],
  COMMUNICATION_MANAGER: [
    "communications.view",
    "communications.send",
    "communications.manage",
    "news.view",
    "news.manage",
  ],
  CLUB_ADMIN: [
    "clubs.view",
    "teams.view",
    "teams.manage",
    "applications.view",
    "schedule.view",
    "results.view",
  ],
  TEAM_MANAGER: ["teams.view", "schedule.view", "results.view", "communications.view"],
};

export function isPermission(value: string): value is Permission {
  return (RBAC_PERMISSIONS as readonly string[]).includes(value);
}

export function permissionLabel(permission: Permission) {
  return permission.replace(".", " / ");
}

export function mergePermissions(
  roleKeys: RbacRoleKey[],
  overrides: Array<{ permission: Permission; granted: boolean }>,
): Set<Permission> {
  const granted = new Set<Permission>();

  for (const roleKey of roleKeys) {
    for (const permission of ROLE_PERMISSIONS[roleKey]) {
      granted.add(permission);
    }
  }

  for (const override of overrides) {
    if (override.granted) {
      granted.add(override.permission);
    } else {
      granted.delete(override.permission);
    }
  }

  return granted;
}

export function resolvePermissionAccess(input: {
  isActive: boolean;
  profileRole: "club" | "admin" | "super-admin";
  roleKeys: RbacRoleKey[];
  overrides: Array<{ permission: Permission; granted: boolean }>;
  permission: Permission;
  clubId?: string | null;
  userClubId?: string | null;
  teamId?: string | null;
  assignedTeamIds?: string[];
}) {
  if (!input.isActive) {
    return false;
  }

  if (input.profileRole === "super-admin") {
    return true;
  }

  const effective = mergePermissions(input.roleKeys, input.overrides);
  const hasAssignedRbacRoles = input.roleKeys.length > 0;

  // Legacy fallback only before RBAC role rows exist (pre-migration accounts).
  if (
    !hasAssignedRbacRoles &&
    input.profileRole === "admin" &&
    input.permission !== "roles.manage"
  ) {
    return true;
  }

  if (!effective.has(input.permission)) {
    return false;
  }

  if (input.teamId && input.assignedTeamIds && input.assignedTeamIds.length > 0) {
    if (!input.assignedTeamIds.includes(input.teamId)) {
      return false;
    }
  }

  if (input.clubId && input.userClubId && input.profileRole === "club") {
    if (input.clubId !== input.userClubId) {
      return false;
    }
  }

  return true;
}

export function hasAnyPlatformPermission(roleKeys: RbacRoleKey[]) {
  return roleKeys.some((roleKey) => PLATFORM_ROLE_KEYS.includes(roleKey));
}
