import { emailTemplateTypeLabel } from "@/lib/admin";
import { formatDateTimeDe } from "@/lib/format";
import { AdminEmpty } from "@/components/admin/AdminPanel";
import type { EmailLog } from "@/types/admin";

const logStatusLabel: Record<EmailLog["status"], string> = {
  sent: "Versendet",
  failed: "Fehlgeschlagen",
  skipped: "Übersprungen",
};

type EmailLogsListProps = {
  logs: EmailLog[];
};

export function EmailLogsList({ logs }: EmailLogsListProps) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase">
        Versandprotokoll
      </h2>
      <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted">
        Die letzten versendeten E-Mails (Status-Mails und Kommunikation).
      </p>

      {logs.length === 0 ? (
        <div className="mt-6">
          <AdminEmpty>Noch keine E-Mails protokolliert.</AdminEmpty>
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {logs.map((log) => (
            <article key={log.id} className="border border-line bg-white p-5">
              <p className="font-display text-lg font-bold tracking-wide text-ink uppercase">
                {log.subject ?? "Ohne Betreff"}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {log.toEmail} · {logStatusLabel[log.status]}
                {log.templateType ? ` · ${emailTemplateTypeLabel[log.templateType]}` : ""}
              </p>
              <p className="mt-2 text-[12px] font-semibold tracking-[0.08em] uppercase text-muted">
                {formatDateTimeDe(log.createdAt)}
                {log.provider ? ` · ${log.provider}` : ""}
              </p>
              {log.error ? (
                <p className="mt-2 text-[13px] text-[#9a2b2b]">{log.error}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
