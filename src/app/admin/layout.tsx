import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminDataProvider } from "@/components/admin/AdminDataProvider";
import { AdminShell } from "@/components/admin/AdminShell";
import { loadAdminNavBadgeCountsAction } from "@/lib/admin/nav-badge-actions";
import { emptyAdminNavBadgeCounts } from "@/lib/admin/nav-badges";
import { getAuthSession } from "@/lib/auth/session";
import { canManageSystem } from "@/lib/auth/roles";
import { canAccessInbox } from "@/lib/inbox/access";
import { loadInboxUnreadCount } from "@/lib/inbox/queries";
import { loadUserAuthorization } from "@/lib/rbac/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Admin | VfL Kirchheim Tournament Hub",
  },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuthSession();
  const authorization = session ? await loadUserAuthorization(session.user.id) : null;
  const badgeCounts = session
    ? await loadAdminNavBadgeCountsAction()
    : { counts: emptyAdminNavBadgeCounts, ready: false };
  const inboxUnreadCount =
    session && canAccessInbox(session, authorization) ? await loadInboxUnreadCount() : 0;

  return (
    <AdminDataProvider>
      <AdminShell
        effectivePermissions={authorization?.permissions ?? []}
        isSuperAdmin={session ? canManageSystem(session.user.role) : false}
        badgeCounts={badgeCounts.counts}
        inboxUnreadCount={inboxUnreadCount}
      >
        {children}
      </AdminShell>
    </AdminDataProvider>
  );
}
