import type { Metadata } from "next";
import Link from "next/link";
import { CommunicationListBoard } from "@/components/admin/CommunicationListBoard";
import {
  AdminNotice,
  AdminPageHeader,
  adminFilterShellClass,
  adminPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import {
  hasPermissionInAuthorization,
  requireAdminSession,
} from "@/lib/auth/guards";
import { canManageSystem } from "@/lib/auth/roles";
import { listCommunications } from "@/lib/communications/queries";
import { cn } from "@/lib/cn";
import type { CommunicationArchiveFilter } from "@/types/communication";

export const metadata: Metadata = {
  title: "Nachrichten",
};

export const dynamic = "force-dynamic";

type AdminCommunicationsPageProps = {
  searchParams: Promise<{
    notice?: string;
    noticeLevel?: string;
    archive?: string;
  }>;
};

function parseArchiveFilter(value: string | undefined): CommunicationArchiveFilter {
  return value === "archived" ? "archived" : "active";
}

export default async function AdminCommunicationsPage({
  searchParams,
}: AdminCommunicationsPageProps) {
  const { notice, noticeLevel, archive: archiveParam } = await searchParams;
  const archiveFilter = parseArchiveFilter(archiveParam);
  const [{ communications, ready, error }, adminAccess] = await Promise.all([
    listCommunications({ archive: archiveFilter }),
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
        "communications.manage",
      ));

  return (
    <div>
      <AdminPageHeader
        title="Nachrichten"
        description="Informationen gezielt an teilnehmende Mannschaften versenden."
        actions={
          <Link href="/admin/kommunikation/neu" className={adminPrimaryButtonClass}>
            Neue Nachricht
          </Link>
        }
      />
      {notice ? (
        <p
          className={cn(
            "mt-6 border px-4 py-3 text-[14px]",
            noticeLevel === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-green-200 bg-green-50 text-green-950",
          )}
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <div className={cn(adminFilterShellClass, "mt-6")}>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "active", label: "Aktiv", href: "/admin/kommunikation" },
              {
                id: "archived",
                label: "Archiv",
                href: "/admin/kommunikation?archive=archived",
              },
            ] as const
          ).map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "inline-flex h-9 items-center rounded-lg px-3 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
                archiveFilter === tab.id
                  ? "bg-navy text-white"
                  : "border border-line bg-white text-muted hover:border-navy/25 hover:text-ink",
              )}
              aria-current={archiveFilter === tab.id ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {!ready ? (
        <AdminNotice>
          Bitte zuerst die PR-C1-Migration im Supabase SQL Editor ausführen.
        </AdminNotice>
      ) : error ? (
        <p
          className="mt-6 border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : (
        <div className="mt-8">
          <CommunicationListBoard
            communications={communications}
            archiveFilter={archiveFilter}
            canManage={canManage}
          />
        </div>
      )}
    </div>
  );
}
