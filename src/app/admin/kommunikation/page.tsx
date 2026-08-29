import type { Metadata } from "next";
import Link from "next/link";
import { CommunicationListBoard } from "@/components/admin/CommunicationListBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listCommunications } from "@/lib/communications/queries";

export const metadata: Metadata = {
  title: "Kommunikation",
};

export const dynamic = "force-dynamic";

export default async function AdminCommunicationsPage() {
  const { communications, ready } = await listCommunications();

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
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die PR-C1-Migration im Supabase SQL Editor ausführen.
        </AdminNotice>
      ) : (
        <CommunicationListBoard communications={communications} />
      )}
    </div>
  );
}
