import type { Metadata } from "next";
import { EmailTemplatesBoard } from "@/components/admin/EmailTemplatesBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listEmailTemplates } from "@/lib/db/admin-queries";

export const metadata: Metadata = { title: "E-Mails" };

export default async function AdminEmailsPage() {
  const { templates, ready } = await listEmailTemplates();

  return (
    <div>
      <AdminPageHeader
        title="E-Mails"
        description="Interne Vorlagen für Rückmeldungen. Der Versand wird später angebunden."
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die neue SQL-Migration im Supabase SQL Editor ausführen, damit
          E-Mail-Vorlagen gespeichert werden können.
        </AdminNotice>
      ) : (
        <EmailTemplatesBoard templates={templates} />
      )}
    </div>
  );
}
