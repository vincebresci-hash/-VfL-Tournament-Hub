import { AdminCard, AdminInfo } from "@/components/admin/AdminPanel";
import {
  communicationRecipientFilterLabel,
  communicationRecipientSendStatusLabel,
  communicationStatusLabel,
  communicationTypeLabel,
} from "@/lib/communications/labels";
import { formatDateTimeDe } from "@/lib/format";
import type { CommunicationDetail } from "@/types/communication";

type CommunicationDetailViewProps = {
  communication: CommunicationDetail;
};

export function CommunicationDetailView({
  communication,
}: CommunicationDetailViewProps) {
  return (
    <div className="mt-8 grid gap-6">
      <AdminCard title="Nachricht">
        <dl className="grid gap-4 sm:grid-cols-2">
          <AdminInfo label="Turnier" value={communication.tournamentName} />
          <AdminInfo
            label="Typ"
            value={`${communicationTypeLabel(communication.type)}${communication.important ? " · Wichtig" : ""}`}
          />
          <AdminInfo
            label="Empfängerfilter"
            value={communicationRecipientFilterLabel(communication.recipientFilter)}
          />
          <AdminInfo
            label="Status"
            value={communicationStatusLabel(communication.status)}
          />
          <AdminInfo label="Betreff" value={communication.subject} />
          <AdminInfo
            label="Versendet"
            value={formatDateTimeDe(communication.sentAt ?? communication.createdAt)}
          />
        </dl>
        <div className="mt-6 border border-line bg-surface px-4 py-4">
          <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Nachrichtentext
          </p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-[14px] leading-6 text-ink">
            {communication.body}
          </pre>
        </div>
      </AdminCard>

      <AdminCard
        title={`Empfänger (${communication.sentCount}/${communication.recipientCount} versendet${communication.failedCount > 0 ? `, ${communication.failedCount} fehlgeschlagen` : ""})`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[14px]">
            <thead className="border-b border-line text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Verein</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Gesendet</th>
                <th className="px-3 py-2">Fehler</th>
              </tr>
            </thead>
            <tbody>
              {communication.recipients.map((recipient) => (
                <tr key={recipient.id} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2 text-ink">{recipient.recipientTeamName}</td>
                  <td className="px-3 py-2 text-muted">
                    {recipient.recipientClubName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted">{recipient.recipientEmail}</td>
                  <td className="px-3 py-2 text-muted">
                    {communicationRecipientSendStatusLabel(recipient.sendStatus)}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {recipient.sentAt ? formatDateTimeDe(recipient.sentAt) : "—"}
                  </td>
                  <td className="px-3 py-2 text-[#9a2b2b]">
                    {recipient.errorMessage ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
