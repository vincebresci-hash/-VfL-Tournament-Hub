import {
  ADMIN_HOME,
  ADMIN_LOGIN,
  canAccessAdmin,
  canAccessClub,
  CLUB_HOME,
  homePathForRole,
} from "@/lib/auth/roles";
import { getSafeRedirect, isAdminPath, isClubPath } from "@/lib/auth/redirects";
import { PLATFORM_ROLE_KEYS } from "@/lib/rbac/permissions";
import type { Permission } from "@/types/rbac";
import type { RbacRoleKey } from "@/types/rbac";
import type { UserRole } from "@/types/auth";

const ADMIN_PERMISSION_PREFIXES = [
  "/admin/bewerbungen",
  "/admin/zahlungen",
  "/admin/absagen",
  "/admin/turniere",
  "/admin/vereine",
  "/admin/teams",
  "/admin/benutzer",
  "/admin/rollen",
  "/admin/news",
  "/admin/kommunikation",
  "/admin/emails",
  "/admin/einstellungen",
];

function hasAccessibleAdminArea(permissions: Set<Permission>) {
  return ADMIN_PERMISSION_PREFIXES.some((prefix) => {
    const match = prefix;
    if (match === "/admin/bewerbungen") return permissions.has("applications.view");
    if (match === "/admin/zahlungen")
      return permissions.has("payments.view") || permissions.has("payments.manage");
    if (match === "/admin/absagen") return permissions.has("cancellations.view");
    if (match === "/admin/turniere") return permissions.has("tournaments.view");
    if (match === "/admin/vereine") return permissions.has("clubs.view");
    if (match === "/admin/teams") return permissions.has("teams.view");
    if (match === "/admin/benutzer") return permissions.has("users.view");
    if (match === "/admin/rollen") return permissions.has("roles.manage");
    if (match === "/admin/news") return permissions.has("news.view");
    if (match === "/admin/kommunikation") return permissions.has("communications.view");
    if (match === "/admin/emails") return permissions.has("communications.view");
    if (match === "/admin/einstellungen")
      return permissions.has("users.manage") || permissions.has("tournaments.manage");
    return false;
  });
}

function firstAccessibleAdminPath(permissions: Set<Permission>) {
  const entries: Array<{ prefix: string; permissions: Permission[] }> = [
    { prefix: "/admin/bewerbungen", permissions: ["applications.view"] },
    { prefix: "/admin/zahlungen", permissions: ["payments.view", "payments.manage"] },
    { prefix: "/admin/absagen", permissions: ["cancellations.view"] },
    { prefix: "/admin/turniere", permissions: ["tournaments.view"] },
    { prefix: "/admin/vereine", permissions: ["clubs.view"] },
    { prefix: "/admin/teams", permissions: ["teams.view"] },
    { prefix: "/admin/benutzer", permissions: ["users.view"] },
    { prefix: "/admin/rollen", permissions: ["roles.manage"] },
    { prefix: "/admin/news", permissions: ["news.view"] },
    { prefix: "/admin/kommunikation", permissions: ["communications.view"] },
    { prefix: "/admin/emails", permissions: ["communications.view"] },
    { prefix: "/admin/einstellungen", permissions: ["users.manage", "tournaments.manage"] },
  ];

  for (const entry of entries) {
    if (entry.permissions.some((permission) => permissions.has(permission))) {
      return entry.prefix;
    }
  }
  return ADMIN_HOME;
}

export function resolveLoginDestination(input: {
  profileRole: UserRole;
  roleKeys: RbacRoleKey[];
  permissions: Permission[];
  rawRedirect?: string | null;
}): string {
  const permissionSet = new Set(input.permissions);
  const fallback = homePathForRole(input.profileRole);
  const candidate = getSafeRedirect(input.rawRedirect, fallback);

  const hasPlatformRoleAssignment = input.roleKeys.some((key) =>
    PLATFORM_ROLE_KEYS.includes(key),
  );

  const platformAdmin =
    canAccessAdmin(input.profileRole) ||
    (hasPlatformRoleAssignment && hasAccessibleAdminArea(permissionSet));

  if (platformAdmin) {
    if (candidate !== fallback && isAdminPath(candidate)) {
      const match = ADMIN_PERMISSION_PREFIXES.find(
        (prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`),
      );
      if (!match) {
        return candidate;
      }
      const allowed =
        (match === "/admin/bewerbungen" && permissionSet.has("applications.view")) ||
        (match === "/admin/zahlungen" &&
          (permissionSet.has("payments.view") || permissionSet.has("payments.manage"))) ||
        (match === "/admin/absagen" && permissionSet.has("cancellations.view")) ||
        (match === "/admin/turniere" && permissionSet.has("tournaments.view")) ||
        (match === "/admin/vereine" && permissionSet.has("clubs.view")) ||
        (match === "/admin/teams" && permissionSet.has("teams.view")) ||
        (match === "/admin/benutzer" && permissionSet.has("users.view")) ||
        (match === "/admin/rollen" && permissionSet.has("roles.manage")) ||
        (match === "/admin/news" && permissionSet.has("news.view")) ||
        (match === "/admin/kommunikation" && permissionSet.has("communications.view")) ||
        (match === "/admin/emails" && permissionSet.has("communications.view")) ||
        (match === "/admin/einstellungen" &&
          (permissionSet.has("users.manage") || permissionSet.has("tournaments.manage")));
      if (allowed) {
        return candidate;
      }
    }
    return firstAccessibleAdminPath(permissionSet);
  }

  if (canAccessClub(input.profileRole) || input.roleKeys.includes("CLUB_ADMIN")) {
    if (input.roleKeys.includes("TEAM_MANAGER") && !input.roleKeys.includes("CLUB_ADMIN")) {
      if (candidate !== fallback && isClubPath(candidate)) {
        return candidate;
      }
      return "/verein/teams";
    }

    if (candidate !== fallback && isClubPath(candidate)) {
      return candidate;
    }
    return CLUB_HOME;
  }

  if (input.roleKeys.includes("TEAM_MANAGER")) {
    return "/verein/teams";
  }

  if (candidate !== fallback && isClubPath(candidate)) {
    return candidate;
  }

  return CLUB_HOME;
}

export function isLoginPath(path: string) {
  return (
    path === ADMIN_LOGIN ||
    path.startsWith(`${ADMIN_LOGIN}?`) ||
    path === "/login" ||
    path.startsWith("/login?")
  );
}

export function adminAreaPrefixes() {
  return ADMIN_PERMISSION_PREFIXES;
}
