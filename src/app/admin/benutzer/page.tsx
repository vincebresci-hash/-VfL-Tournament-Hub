import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminInviteUserDialog } from "@/components/admin/AdminInviteUserDialog";
import { AdminUsersBoard } from "@/components/admin/AdminUsersBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { getAuthSession } from "@/lib/auth/session";
import { canManageSystem } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/guards";
import { ADMIN_LOGIN } from "@/lib/auth/roles";
import {
  listAdminClubsForSelect,
  listAdminTeamsForSelect,
  listAdminUsers,
  listRbacRoles,
} from "@/lib/rbac/queries";

export const metadata: Metadata = { title: "Benutzer" };

type PageProps = {
  searchParams: Promise<{ deleted?: string }>;
};

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getAuthSession();
  if (!session) {
    redirect(ADMIN_LOGIN);
  }

  const access = await requirePermission("users.view");
  if ("error" in access && access.error && !canManageSystem(session.user.role)) {
    redirect(ADMIN_LOGIN);
  }

  const [{ users, ready }, { roles }, clubs, teams] = await Promise.all([
    listAdminUsers(),
    listRbacRoles(),
    listAdminClubsForSelect(),
    listAdminTeamsForSelect(),
  ]);

  const canInvite = canManageSystem(session.user.role);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <AdminPageHeader
          title="Benutzer"
          description="Registrierte Benutzer, Einladungen, Rollen und effektive Berechtigungen."
        />
        {canInvite && ready ? (
          <AdminInviteUserDialog roles={roles} clubs={clubs} teams={teams} />
        ) : null}
      </div>
      {params.deleted === "1" ? (
        <AdminNotice>Der Benutzer wurde erfolgreich gelöscht.</AdminNotice>
      ) : null}
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
