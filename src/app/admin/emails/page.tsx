import type { Metadata } from "next";
import Link from "next/link";
import { EmailLogsList } from "@/components/admin/EmailLogsList";
import { EmailTemplatesBoard } from "@/components/admin/EmailTemplatesBoard";
import {
  AdminNotice,
  AdminPageHeader,
  adminPrimaryButtonClass,
} from "@/components/admin/AdminPanel";
import { listEmailLogs, listEmailTemplates } from "@/lib/db/admin-queries";

export const metadata: Metadata = { title: "E-Mail-Vorlagen" };

export default async function AdminEmailsPage() {
  const [{ templates, ready }, { logs, ready: logsReady }] = await Promise.all([
    listEmailTemplates(),
    listEmailLogs(),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="E-Mail-Vorlagen"
        description="Vorlagen für automatische und manuelle Turnier-E-Mails verwalten."
        actions={
          ready ? (
            <Link href="/admin/emails/neu" className={adminPrimaryButtonClass}>
              Neue Vorlage
            </Link>
          ) : undefined
        }
      />
      {!ready ? (
        <AdminNotice>
          Bitte zuerst die neue SQL-Migration im Supabase SQL Editor ausführen, damit
          E-Mail-Vorlagen gespeichert werden können.
        </AdminNotice>
      ) : (
        <div className="mt-8">
          <EmailTemplatesBoard templates={templates} />
        </div>
      )}
      {logsReady ? <EmailLogsList logs={logs} /> : null}
    </div>
  );
}
