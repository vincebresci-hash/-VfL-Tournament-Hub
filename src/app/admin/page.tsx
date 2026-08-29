import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getAuthSession } from "@/lib/auth/session";
import { canManageSystem } from "@/lib/auth/roles";
import { getAdminDashboardData } from "@/lib/db/admin-queries";
import { loadUserAuthorization } from "@/lib/rbac/queries";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function AdminHomePage() {
  const [data, session] = await Promise.all([getAdminDashboardData(), getAuthSession()]);
  const authorization = session
    ? await loadUserAuthorization(session.user.id)
    : { permissions: [] as const };

  return (
    <AdminDashboard
      data={data}
      permissions={[...authorization.permissions]}
      isSuperAdmin={session ? canManageSystem(session.user.role) : false}
    />
  );
}
