import type { Metadata } from "next";
import Link from "next/link";
import { CommunicationListBoard } from "@/components/admin/CommunicationListBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listCommunications } from "@/lib/communications/queries";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Kommunikation",
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AdminPageHeader
          title="Kommunikation"
          description="Turnierbezogene E-Mails an angenommene Teams, Warteliste oder individuelle Empfänger."
        />
        <Link
          href="/admin/kommunikation/neu"
          className="inline-flex h-11 items-center justify-center bg-brand-yellow px-5 text-[12px] font-semibold tracking-[0.08em] text-navy uppercase hover:bg-[#ffe066]"
        >
          Neue Nachricht
        </Link>
      </div>
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
        <CommunicationListBoard communications={communications} />
      )}
    </div>
  );
}
