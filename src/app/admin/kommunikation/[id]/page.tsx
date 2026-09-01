import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunicationDetailView } from "@/components/admin/CommunicationDetailView";
import { AdminPageHeader } from "@/components/admin/AdminPanel";
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
  const communication = await getCommunicationDetail(id);

  if (!communication) {
    notFound();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <AdminPageHeader
          title={communication.subject}
          description={`${communication.tournamentName} · ${communication.recipientCount} Empfänger`}
        />
        <Link
          href="/admin/kommunikation"
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
      <CommunicationDetailView communication={communication} />
    </div>
  );
}
