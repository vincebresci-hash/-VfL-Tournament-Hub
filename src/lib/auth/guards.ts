import { getAuthSession } from "@/lib/auth/session";
import { canAccessAdmin, canAccessClub, canManageSystem } from "@/lib/auth/roles";
import { loadUserAuthorization } from "@/lib/rbac/queries";
import { resolvePermissionAccess } from "@/lib/rbac/permissions";
import type { Permission, PermissionContext } from "@/types/rbac";
import type { AuthSession } from "@/types/auth";

type GuardResult = {
  session: AuthSession;
  authorization: Awaited<ReturnType<typeof loadUserAuthorization>>;
};

type GuardError = {
  session: AuthSession | null;
  authorization: null;
  error: string;
};

async function loadGuardSession() {
  const session = await getAuthSession();
  if (!session) {
    return { session: null, authorization: null, error: "Bitte zuerst anmelden." };
  }

  if (session.user.isActive === false) {
    return { session: null, authorization: null, error: "Konto ist deaktiviert." };
  }

  const authorization = await loadUserAuthorization(session.user.id);
  return { session, authorization, error: null };
}

export async function requireActiveSession():
  Promise<GuardResult | GuardError> {
  const loaded = await loadGuardSession();
  if (!loaded.session || !loaded.authorization || loaded.error) {
    return {
      session: loaded.session,
      authorization: null,
      error: loaded.error ?? "Bitte zuerst anmelden.",
    };
  }

  return {
    session: loaded.session,
    authorization: loaded.authorization,
  };
}

export async function requireAdminSession():
  Promise<GuardResult | GuardError> {
  const loaded = await requireActiveSession();
  if ("error" in loaded && loaded.error) {
    return loaded;
  }

  const { session, authorization } = loaded as GuardResult;
  const hasAdminRouteAccess =
    canAccessAdmin(session.user.role) ||
    authorization.roleKeys.some((roleKey) =>
      ["SUPER_ADMIN", "ADMIN", "TOURNAMENT_MANAGER", "APPLICATION_MANAGER", "FINANCE_MANAGER", "COMMUNICATION_MANAGER"].includes(
        roleKey,
      ),
    );

  if (!hasAdminRouteAccess) {
    return { session, authorization: null, error: "Kein Adminzugang." };
  }

  return { session, authorization };
}

export async function requireSuperAdminSession():
  Promise<GuardResult | GuardError> {
  const loaded = await requireActiveSession();
  if ("error" in loaded && loaded.error) {
    return loaded;
  }

  const { session, authorization } = loaded as GuardResult;
  if (!canManageSystem(session.user.role)) {
    return { session, authorization: null, error: "Super-Admin-Zugriff erforderlich." };
  }

  return { session, authorization };
}

export async function requirePermission(
  permission: Permission,
  context: PermissionContext = {},
): Promise<GuardResult | GuardError> {
  const loaded = await requireActiveSession();
  if ("error" in loaded && loaded.error) {
    return loaded;
  }

  const { session, authorization } = loaded as GuardResult;
  const allowed = resolvePermissionAccess({
    isActive: session.user.isActive !== false,
    profileRole: session.user.role,
    roleKeys: authorization.roleKeys,
    overrides: authorization.overrides,
    permission,
    clubId: context.clubId,
    userClubId: session.user.clubId,
    teamId: context.teamId,
    assignedTeamIds: authorization.assignedTeamIds,
  });

  if (!allowed) {
    return { session, authorization: null, error: "Keine Berechtigung für diese Aktion." };
  }

  return { session, authorization };
}

export async function requireClubAccess(clubId: string):
  Promise<GuardResult | GuardError> {
  const loaded = await requireActiveSession();
  if ("error" in loaded && loaded.error) {
    return loaded;
  }

  const { session, authorization } = loaded as GuardResult;
  if (canAccessAdmin(session.user.role)) {
    const adminAccess = await requirePermission("clubs.view", { clubId });
    if ("error" in adminAccess && adminAccess.error) {
      const platformAccess = await requireAdminSession();
      if ("error" in platformAccess && platformAccess.error) {
        return adminAccess;
      }
      return platformAccess as GuardResult;
    }
    return adminAccess as GuardResult;
  }

  if (!canAccessClub(session.user.role) || session.user.clubId !== clubId) {
    return { session, authorization: null, error: "Kein Vereinszugriff." };
  }

  return { session, authorization };
}

export async function requireTeamAccess(teamId: string, clubId: string):
  Promise<GuardResult | GuardError> {
  const clubAccess = await requireClubAccess(clubId);
  if ("error" in clubAccess && clubAccess.error) {
    return clubAccess;
  }

  const { session, authorization } = clubAccess as GuardResult;
  if (canManageSystem(session.user.role) || canAccessAdmin(session.user.role)) {
    return { session, authorization };
  }

  if (!authorization.assignedTeamIds.includes(teamId)) {
    const teamPermission = await requirePermission("teams.manage", { clubId, teamId });
    if ("error" in teamPermission && teamPermission.error) {
      return teamPermission;
    }
    return teamPermission as GuardResult;
  }

  return { session, authorization };
}

export function hasPermissionInAuthorization(
  authorization: Awaited<ReturnType<typeof loadUserAuthorization>>,
  session: AuthSession,
  permission: Permission,
  context: PermissionContext = {},
) {
  return resolvePermissionAccess({
    isActive: session.user.isActive !== false,
    profileRole: session.user.role,
    roleKeys: authorization.roleKeys,
    overrides: authorization.overrides,
    permission,
    clubId: context.clubId,
    userClubId: session.user.clubId,
    teamId: context.teamId,
    assignedTeamIds: authorization.assignedTeamIds,
  });
}
