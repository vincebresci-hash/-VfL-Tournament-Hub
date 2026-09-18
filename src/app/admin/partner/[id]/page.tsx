import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartnerAdminForm } from "@/components/admin/PartnerAdminForm";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { getAdminPartner } from "@/lib/partners/queries";

export const metadata: Metadata = { title: "Partner bearbeiten" };

type AdminPartnerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminPartnerDetailPage({
  params,
}: AdminPartnerDetailPageProps) {
  const { id } = await params;
  const [partner, adminAccess] = await Promise.all([
    getAdminPartner(id),
    requireAdminSession(),
  ]);

  if (!partner) {
    notFound();
  }

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

  return <PartnerAdminForm partner={partner} canManage={canManage} />;
}
