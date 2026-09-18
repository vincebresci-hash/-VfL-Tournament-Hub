import type { Metadata } from "next";
import { PartnerAdminForm } from "@/components/admin/PartnerAdminForm";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Partner hinzufügen" };

export default async function AdminNewPartnerPage() {
  const adminAccess = await requireAdminSession();
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

  if (!canManage) {
    redirect("/admin/partner");
  }

  return <PartnerAdminForm canManage />;
}
