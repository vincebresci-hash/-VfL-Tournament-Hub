import type { Metadata } from "next";
import { AdminClubsBoard } from "@/components/admin/AdminClubsBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listAdminClubs } from "@/lib/db/admin-queries";

export const metadata: Metadata = { title: "Vereine" };

export default async function AdminClubsPage() {
  const { clubs, ready } = await listAdminClubs();

  return (
    <div>
      <AdminPageHeader
        title="Vereine"
        description="Registrierte Vereine, Ansprechpartner und Bewerbungszahlen aus der Datenbank."
      />
      {!ready ? (
        <AdminNotice>
          Die Vereinsdaten stehen bereit, sobald die SQL-Migration im Supabase SQL Editor
          ausgeführt wurde.
        </AdminNotice>
      ) : (
        <AdminClubsBoard clubs={clubs} />
      )}
    </div>
  );
}
