import type { Metadata } from "next";
import Link from "next/link";
import { CommunicationListBoard } from "@/components/admin/CommunicationListBoard";
import {
  AdminNotice,
  AdminPageHeader,
  adminPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import { listCommunications } from "@/lib/communications/queries";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Nachrichten",
};

export const dynamic = "force-dynamic";

type AdminCommunicationsPageProps = {
  searchParams: Promise<{ notice?: string; noticeLevel?: string }>;
};

export default async function AdminCommunicationsPage({
  searchParams,
}: AdminCommunicationsPageProps) {
  const { notice, noticeLevel } = await searchParams;
  const { communications, ready, error } = await listCommunications();

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
          <CommunicationListBoard communications={communications} />
        </div>
      )}
    </div>
  );
}
