import type { Metadata } from "next";
import { AdminTeamsBoard } from "@/components/admin/AdminTeamsBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listAdminTeams, listAdminTournaments } from "@/lib/db/admin-queries";

export const metadata: Metadata = { title: "Teams" };

export default async function AdminTeamsPage() {
  const [{ teams, ready }, tournaments] = await Promise.all([
    listAdminTeams(),
    listAdminTournaments(),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Teams"
        description="Alle Mannschaften mit Verein, Altersklasse und Bewerbungen."
      />
      {!ready ? (
        <AdminNotice>
          Die Teamdaten stehen bereit, sobald die Datenbank erreichbar ist.
        </AdminNotice>
      ) : (
        <AdminTeamsBoard teams={teams} tournaments={tournaments} />
      )}
    </div>
  );
}
