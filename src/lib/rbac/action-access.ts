import { requirePermission } from "@/lib/auth/guards";
import type { Permission } from "@/types/rbac";
import type { AuthSession } from "@/types/auth";

type ActionAccessSuccess = {
  session: AuthSession;
  error: null;
};

type ActionAccessFailure = {
  session: AuthSession | null;
  error: string;
};

export async function requirePermissionAccess(
  permission: Permission,
): Promise<ActionAccessSuccess | ActionAccessFailure> {
  const access = await requirePermission(permission);
  if ("error" in access && access.error) {
    return { session: access.session, error: access.error };
  }

  if (!access.session) {
    return { session: null, error: "Bitte zuerst anmelden." };
  }

  return { session: access.session, error: null };
}

export async function requireAnyPermissionAccess(
  permissions: Permission[],
): Promise<ActionAccessSuccess | ActionAccessFailure> {
  for (const permission of permissions) {
    const access = await requirePermission(permission);
    if (!("error" in access && access.error) && access.session) {
      return { session: access.session, error: null };
    }
  }

  const last = await requirePermission(permissions[0]!);
  return {
    session: last.session,
    error:
      ("error" in last && last.error) ||
      "Keine Berechtigung für diese Aktion.",
  };
}

export function requireApplicationsView() {
  return requirePermissionAccess("applications.view");
}

export function requireApplicationsManage() {
  return requirePermissionAccess("applications.manage");
}

export function requireTournamentsView() {
  return requirePermissionAccess("tournaments.view");
}

export function requireTournamentsManage() {
  return requirePermissionAccess("tournaments.manage");
}

export function requirePaymentsManage() {
  return requirePermissionAccess("payments.manage");
}

export function requireCommunicationsView() {
  return requirePermissionAccess("communications.view");
}

export function requireCommunicationsManage() {
  return requireAnyPermissionAccess(["communications.manage", "communications.send"]);
}

export function requireScheduleManage() {
  return requirePermissionAccess("schedule.manage");
}

export function requireResultsManage() {
  return requirePermissionAccess("results.manage");
}

export function requireNewsManage() {
  return requirePermissionAccess("news.manage");
}

export function requireClubsManage() {
  return requirePermissionAccess("clubs.manage");
}

export function requireTeamsManage() {
  return requirePermissionAccess("teams.manage");
}

export function requireCancellationsView() {
  return requirePermissionAccess("cancellations.view");
}

export function requireCancellationsManage() {
  return requireAnyPermissionAccess(["cancellations.manage", "cancellations.decide"]);
}
