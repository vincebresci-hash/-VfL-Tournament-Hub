import type { Metadata } from "next";
import { CommunicationComposeForm } from "@/components/admin/CommunicationComposeForm";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listAdminTournaments } from "@/lib/db/admin-queries";

export const metadata: Metadata = {
  title: "Neue Kommunikation",
};

export const dynamic = "force-dynamic";

export default async function AdminCommunicationComposePage() {
  const tournaments = await listAdminTournaments();

  return (
    <div>
      <AdminPageHeader
        title="Neue Kommunikation"
        description="Nachricht verfassen, Empfänger prüfen und per E-Mail versenden."
      />
      {tournaments.length === 0 ? (
        <AdminNotice>Es sind noch keine Turniere vorhanden.</AdminNotice>
      ) : (
        <CommunicationComposeForm tournaments={tournaments} />
      )}
    </div>
  );
}
