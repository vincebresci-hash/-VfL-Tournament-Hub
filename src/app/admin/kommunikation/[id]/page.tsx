import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunicationDetailView } from "@/components/admin/CommunicationDetailView";
import { AdminPageHeader } from "@/components/admin/AdminPanel";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { getCommunicationDetail } from "@/lib/communications/queries";

type CommunicationDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: CommunicationDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const communication = await getCommunicationDetail(id);

  return {
    title: communication?.subject ?? "Kommunikation",
  };
}

export default async function AdminCommunicationDetailPage({
  params,
  searchParams,
}: CommunicationDetailPageProps) {
  const { id } = await params;
  const { notice } = await searchParams;
  const [communication, adminAccess] = await Promise.all([
    getCommunicationDetail(id),
    requireAdminSession(),
  ]);

  if (!communication) {
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
        "communications.manage",
      ));

  const backHref = communication.archivedAt
    ? "/admin/kommunikation?archive=archived"
    : "/admin/kommunikation";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AdminPageHeader
          title={communication.subject}
          description={`${communication.tournamentName} · ${communication.recipientCount} Empfänger`}
        />
        <Link
          href={backHref}
          className="text-[14px] font-semibold text-ink underline decoration-brand-yellow underline-offset-2"
        >
          Zurück zur Übersicht
        </Link>
      </div>
      {notice ? (
        <p className="mt-6 text-[14px] text-ink" role="status">
          {notice}
        </p>
      ) : null}
      <CommunicationDetailView communication={communication} canManage={canManage} />
    </div>
  );
}
