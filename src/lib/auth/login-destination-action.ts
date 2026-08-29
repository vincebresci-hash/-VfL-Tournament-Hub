"use server";

import { getAuthSession } from "@/lib/auth/session";
import { loadUserAuthorization } from "@/lib/rbac/queries";
import { resolveLoginDestination } from "@/lib/auth/login-destination";
import type { UserRole } from "@/types/auth";

export async function getLoginDestinationAction(rawRedirect?: string | null): Promise<string> {
  const session = await getAuthSession();
  if (!session) {
    return "/login";
  }

  const authorization = await loadUserAuthorization(session.user.id);
  return resolveLoginDestination({
    profileRole: session.user.role as UserRole,
    roleKeys: authorization.roleKeys,
    permissions: authorization.permissions,
    rawRedirect,
  });
}
