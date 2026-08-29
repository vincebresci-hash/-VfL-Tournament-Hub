"use server";

import { getAuthSession } from "@/lib/auth/session";
import { markInvitationAcceptedForAuthUser } from "@/lib/rbac/invitation-acceptance";
import { loadUserAuthorization } from "@/lib/rbac/queries";
import { resolveLoginDestination } from "@/lib/auth/login-destination";
import type { UserRole } from "@/types/auth";

export async function getLoginDestinationAction(rawRedirect?: string | null): Promise<string> {
  const session = await getAuthSession();
  if (!session) {
    return "/login";
  }

  await markInvitationAcceptedForAuthUser({
    userId: session.user.id,
    email: session.user.email,
    source: "login_destination",
  });

  const authorization = await loadUserAuthorization(session.user.id);
  return resolveLoginDestination({
    profileRole: session.user.role as UserRole,
    roleKeys: authorization.roleKeys,
    permissions: authorization.permissions,
    rawRedirect,
  });
}
