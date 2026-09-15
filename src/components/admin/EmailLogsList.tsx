import { emailTemplateTypeLabel } from "@/lib/admin";
import { formatDateTimeDe } from "@/lib/format";
import {
  AdminEmpty,
  adminCardShellClass,
  adminSectionTitleClass,
  adminStatusBadgeClass,
} from "@/components/admin/AdminPanel";
import type { EmailLog } from "@/types/admin";

const logStatusLabel: Record<EmailLog["status"], string> = {
  sent: "Versendet",
  failed: "Fehlgeschlagen",
  skipped: "Übersprungen",
};

function logStatusClassName(status: EmailLog["status"]) {
  switch (status) {
    case "sent":
      return "bg-[#e8f5ee] text-[#1f6b3f]";
    case "failed":
      return "bg-[#fff5f5] text-[#9a2b2b]";
    default:
      return "bg-surface text-muted";
  }
}

type EmailLogsListProps = {
  logs: EmailLog[];
};

export function EmailLogsList({ logs }: EmailLogsListProps) {
  return (
    <section className="mt-10">
      <h2 className={adminSectionTitleClass}>Versandprotokoll</h2>
      <p className="mt-1.5 max-w-2xl text-[14px] leading-6 text-muted">
        Die letzten versendeten E-Mails (Status-Mails und Kommunikation).
      </p>

      {logs.length === 0 ? (
        <div className="mt-5">
          <AdminEmpty>Noch keine E-Mails protokolliert.</AdminEmpty>
        </div>
      ) : (
        <div className="mt-5 grid gap-2.5">
          {logs.map((log) => (
            <article key={log.id} className={`${adminCardShellClass} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 truncate font-display text-[15px] font-bold tracking-wide text-ink uppercase sm:text-lg">
                  {log.subject ?? "Ohne Betreff"}
                </p>
                <span
                  className={`shrink-0 ${adminStatusBadgeClass} ${logStatusClassName(log.status)}`}
                >
                  {logStatusLabel[log.status]}
                </span>
              </div>
              <p className="mt-1 truncate text-[13px] text-muted">
                {log.toEmail}
                {log.templateType ? ` · ${emailTemplateTypeLabel[log.templateType]}` : ""}
              </p>
              <p className="mt-2 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">
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
