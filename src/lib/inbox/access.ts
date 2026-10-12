import "server-only";

import { canManageSystem } from "@/lib/auth/roles";
import { hasPermissionInAuthorization } from "@/lib/auth/guards";
import { loadUserAuthorization } from "@/lib/rbac/queries";
import type { AuthSession } from "@/types/auth";

type Authorization = Awaited<ReturnType<typeof loadUserAuthorization>>;

export function canAccessInbox(
  session: AuthSession | null | undefined,
  authorization: Authorization | null | undefined,
): boolean {
  if (!session || !authorization) {
    return false;
  }
  if (canManageSystem(session.user.role)) {
    return true;
  }
  return hasPermissionInAuthorization(authorization, session, "inbox.view");
}

export function canManageInbox(
  session: AuthSession | null | undefined,
  authorization: Authorization | null | undefined,
): boolean {
  if (!session || !authorization) {
    return false;
  }
  if (canManageSystem(session.user.role)) {
    return true;
  }
  return hasPermissionInAuthorization(authorization, session, "inbox.manage");
}

/** Manual sync trigger: SUPER_ADMIN only. */
export function canTriggerInboxSync(
  session: AuthSession | null | undefined,
  authorization: Authorization | null | undefined,
): boolean {
  if (!session || !authorization) {
    return false;
  }
  if (canManageSystem(session.user.role)) {
    return true;
  }
  return authorization.roleKeys.includes("SUPER_ADMIN");
}
