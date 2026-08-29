import { redirect } from "next/navigation";
import { ADMIN_HOME, ADMIN_LOGIN } from "@/lib/auth/roles";
import { canManageSystem } from "@/lib/auth/roles";
import {
  requireAdminSession,
  requirePermission,
  hasPermissionInAuthorization,
} from "@/lib/auth/guards";
import { getAdminRoutePermissions } from "@/lib/rbac/admin-access";
import type { Permission } from "@/types/rbac";

function isGuardSuccess(
  result: Awaited<ReturnType<typeof requireAdminSession>>,
): result is {
  session: NonNullable<Awaited<ReturnType<typeof requireAdminSession>>["session"]>;
  authorization: NonNullable<Awaited<ReturnType<typeof requireAdminSession>>["authorization"]>;
} {
  return !("error" in result && result.error) && result.session !== null && result.authorization !== null;
}

export async function requireAdminPageAccess(pathname: string) {
  if (pathname === "/admin/login") {
    return;
  }

  const adminAccess = await requireAdminSession();
  if (!isGuardSuccess(adminAccess)) {
    redirect(ADMIN_LOGIN);
  }

  const required = getAdminRoutePermissions(pathname);
  if (!required || required.length === 0) {
    return;
  }

  const { session, authorization } = adminAccess;

  if (canManageSystem(session.user.role)) {
    return;
  }

  const allowed = required.some((permission) =>
    hasPermissionInAuthorization(authorization, session, permission),
  );

  if (!allowed) {
    redirect(ADMIN_HOME);
  }
}

export async function requirePagePermission(permission: Permission) {
  const access = await requirePermission(permission);
  if ("error" in access && access.error) {
    redirect(ADMIN_HOME);
  }
}

export async function requireAnyPagePermission(permissions: Permission[]) {
  const adminAccess = await requireAdminSession();
  if (!isGuardSuccess(adminAccess)) {
    redirect(ADMIN_LOGIN);
  }

  const { session, authorization } = adminAccess;

  if (canManageSystem(session.user.role)) {
    return;
  }

  const allowed = permissions.some((permission) =>
    hasPermissionInAuthorization(authorization, session, permission),
  );

  if (!allowed) {
    redirect(ADMIN_HOME);
  }
}
