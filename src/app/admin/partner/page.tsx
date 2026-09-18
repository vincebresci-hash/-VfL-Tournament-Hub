import type { Metadata } from "next";
import Link from "next/link";
import { PartnersAdminBoard } from "@/components/admin/PartnersAdminBoard";
import {
  AdminNotice,
  AdminPageHeader,
  adminPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { listAdminPartners } from "@/lib/partners/queries";

export const metadata: Metadata = { title: "Partner" };

export default async function AdminPartnerPage() {
  const [{ partners, ready }, adminAccess] = await Promise.all([
    listAdminPartners(),
    requireAdminSession(),
  ]);

  const canManage =
    !("error" in adminAccess && adminAccess.error) &&
    adminAccess.session !== null &&
    adminAccess.authorization !== null &&
    (canManageSystem(adminAccess.session.user.role) ||
      hasPermissionInAuthorization(
        adminAccess.authorization,
        adminAccess.session,
        "partners.manage",
      ));

  return (
    <div>
      <AdminPageHeader
        title="Partner"
        description="Verwalte Partner und Sponsoren, die im Tournament Hub angezeigt werden."
        actions={
          ready && canManage ? (
            <Link href="/admin/partner/neu" className={adminPrimaryButtonClass}>
              + Partner hinzufügen
            </Link>
          ) : undefined
        }
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die SQL-Migration im Supabase SQL Editor ausführen, damit
          Partner gespeichert werden können.
        </AdminNotice>
      ) : (
        <div className="mt-8">
          <PartnersAdminBoard partners={partners} canManage={canManage} />
        </div>
      )}
    </div>
  );
}
