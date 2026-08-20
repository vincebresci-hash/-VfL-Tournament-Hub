import type { Metadata } from "next";
import { EmailsTabs } from "@/components/admin/EmailsTabs";
import { AdminNotice, AdminPageHeader } from "@/components/admin/AdminPanel";
import { listEmailTemplates } from "@/lib/db/admin-queries";
import { listEmailLogs } from "@/lib/email/logs";

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
        description="Vorlagen verwalten und den automatischen Versand über Resend nachverfolgen."
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die neue SQL-Migration im Supabase SQL Editor ausführen, damit
          E-Mail-Vorlagen gespeichert werden können.
        </AdminNotice>
      ) : (
        <EmailsTabs templates={templates} logs={logs} logsReady={logsReady} />
      )}
    </div>
  );
}
