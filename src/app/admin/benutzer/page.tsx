import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminUsersBoard } from "@/components/admin/AdminUsersBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { getAuthSession } from "@/lib/auth/session";
import { canManageSystem } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/guards";
import { ADMIN_LOGIN } from "@/lib/auth/roles";
import { listAdminUsers } from "@/lib/rbac/queries";

export const metadata: Metadata = { title: "Benutzer" };

export default async function AdminUsersPage() {
  const session = await getAuthSession();
  if (!session) {
    redirect(ADMIN_LOGIN);
  }

  const access = await requirePermission("users.view");
  if ("error" in access && access.error && !canManageSystem(session.user.role)) {
    redirect(ADMIN_LOGIN);
  }

  const { users, ready } = await listAdminUsers();

  return (
    <div>
      <AdminPageHeader
        title="Benutzer"
        description="Registrierte Benutzer, Rollen und effektive Berechtigungen."
      />
      {!ready ? (
        <AdminNotice>
          Die Benutzerverwaltung steht bereit, sobald die RBAC-Migration im Supabase SQL
          Editor ausgeführt wurde.
        </AdminNotice>
      ) : (
        <AdminUsersBoard users={users} />
      )}
    </div>
  );
}
