import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminUserDetail } from "@/components/admin/AdminUserDetail";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { getAuthSession } from "@/lib/auth/session";
import { canManageSystem } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/guards";
import { ADMIN_LOGIN } from "@/lib/auth/roles";
import { getAdminUser, listRbacRoles } from "@/lib/rbac/queries";

export const metadata: Metadata = { title: "Benutzer" };

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getAuthSession();
  if (!session) {
    redirect(ADMIN_LOGIN);
  }

  const viewAccess = await requirePermission("users.view");
  if ("error" in viewAccess && viewAccess.error && !canManageSystem(session.user.role)) {
    redirect(ADMIN_LOGIN);
  }

  const manageAccess = await requirePermission("users.manage");
  const rolesAccess = await requirePermission("roles.manage");
  const user = await getAdminUser(id);
  const { roles, ready } = await listRbacRoles();

  if (!ready) {
    return (
      <div>
        <AdminPageHeader title="Benutzer" />
        <AdminNotice>
          Die Benutzerverwaltung steht bereit, sobald die RBAC-Migration im Supabase SQL
          Editor ausgeführt wurde.
        </AdminNotice>
      </div>
    );
  }

  if (!user) {
    notFound();
  }

  return (
    <div>
      <AdminPageHeader
        title={user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.email}
        description="Benutzerprofil, Rollen und effektive Berechtigungen."
      />
      <AdminUserDetail
        user={user}
        roles={roles}
        canManageUsers={!("error" in manageAccess && manageAccess.error)}
        canManageRoles={
          canManageSystem(session.user.role) &&
          !("error" in rolesAccess && rolesAccess.error)
        }
      />
    </div>
  );
}
