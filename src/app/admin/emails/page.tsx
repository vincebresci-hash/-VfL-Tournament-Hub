import type { Metadata } from "next";
import { EmailLogsList } from "@/components/admin/EmailLogsList";
import { EmailTemplatesBoard } from "@/components/admin/EmailTemplatesBoard";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listEmailLogs, listEmailTemplates } from "@/lib/db/admin-queries";

export const metadata: Metadata = { title: "E-Mails" };

export default async function AdminEmailsPage() {
  const [{ templates, ready }, { logs, ready: logsReady }] = await Promise.all([
    listEmailTemplates(),
    listEmailLogs(),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="E-Mails"
        description="Vorlagen für Statusrückmeldungen. Beim Speichern eines Bewerbungsstatus wird die passende Mail an contact_email gesendet."
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die neue SQL-Migration im Supabase SQL Editor ausführen, damit
          E-Mail-Vorlagen gespeichert werden können.
        </AdminNotice>
      ) : (
        <EmailTemplatesBoard templates={templates} />
      )}
      {logsReady ? <EmailLogsList logs={logs} /> : null}
    </div>
  );
}
