import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminRolesBoard } from "@/components/admin/AdminRolesBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { getAuthSession } from "@/lib/auth/session";
import { canManageSystem } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/guards";
import { ADMIN_LOGIN } from "@/lib/auth/roles";
import { listRolePermissionMatrix } from "@/lib/rbac/queries";

export const metadata: Metadata = { title: "Rollen" };

export default async function AdminRolesPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect(ADMIN_LOGIN);
  }

  const access = await requirePermission("roles.manage");
  if ("error" in access && access.error && !canManageSystem(session.user.role)) {
    redirect(ADMIN_LOGIN);
  }

  const matrix = await listRolePermissionMatrix();

  return (
    <div>
      <AdminPageHeader
        title="Rollen"
        description="Systemrollen und ihre effektiven Berechtigungen."
      />
      {matrix.length === 0 ? (
        <AdminNotice>
          Die Rollenübersicht steht bereit, sobald die RBAC-Migration im Supabase SQL
          Editor ausgeführt wurde.
        </AdminNotice>
      ) : (
        <AdminRolesBoard matrix={matrix} />
      )}
    </div>
  );
}
