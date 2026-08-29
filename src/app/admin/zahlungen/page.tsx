import type { Metadata } from "next";
import { AdminPaymentsBoard } from "@/components/admin/AdminPaymentsBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { loadAdminPaymentRecordsAction } from "@/lib/payments/actions";

export const metadata: Metadata = { title: "Zahlungen" };

export default async function AdminPaymentsPage() {
  const { records, ready, error } = await loadAdminPaymentRecordsAction();

  return (
    <div>
      <AdminPageHeader
        title="Zahlungen"
        description="Zahlungsstatus für angenommene Bewerbungen. Zugriff unabhängig von der Bewerbungsverwaltung."
      />
      {error ? (
        <AdminNotice>
          <span className="text-[#9a2b2b]">{error}</span>
        </AdminNotice>
      ) : null}
      {!ready ? (
        <AdminNotice>
          Die Zahlungsdaten stehen bereit, sobald die Datenbank-Migrationen ausgeführt wurden.
        </AdminNotice>
      ) : (
        <AdminPaymentsBoard records={records} />
      )}
    </div>
  );
}
