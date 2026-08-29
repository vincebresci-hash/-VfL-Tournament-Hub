import type { Permission } from "@/types/rbac";

export const ADMIN_ROUTE_PERMISSIONS: Array<{
  prefix: string;
  permissions: Permission[];
}> = [
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

const NAV_PERMISSIONS: Record<string, Permission[]> = {
  "/admin": [],
  "/admin/bewerbungen": ["applications.view"],
  "/admin/zahlungen": ["payments.view", "payments.manage"],
  "/admin/absagen": ["cancellations.view"],
  "/admin/turniere": ["tournaments.view"],
  "/admin/vereine": ["clubs.view"],
  "/admin/teams": ["teams.view"],
  "/admin/benutzer": ["users.view"],
  "/admin/rollen": ["roles.manage"],
  "/admin/news": ["news.view"],
  "/admin/kommunikation": ["communications.view"],
  "/admin/emails": ["communications.view"],
  "/admin/profil": [],
  "/admin/einstellungen": ["users.manage", "tournaments.manage"],
};

export function getAdminRoutePermissions(pathname: string): Permission[] | null {
  if (pathname === "/admin/login") {
    return null;
  }

  const match = ADMIN_ROUTE_PERMISSIONS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );

  return match?.permissions ?? null;
}

export function canSeeAdminNavItem(
  href: string,
  effectivePermissions: Set<Permission>,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) {
    return true;
  }

  const required = NAV_PERMISSIONS[href];
  if (!required || required.length === 0) {
    return true;
  }

  return required.some((permission) => effectivePermissions.has(permission));
}

export function hasEffectivePermission(
  effectivePermissions: Set<Permission>,
  permission: Permission,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) {
    return true;
  }

  return effectivePermissions.has(permission);
}
