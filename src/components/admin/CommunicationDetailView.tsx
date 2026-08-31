import Link from "next/link";
import { AdminCard, AdminInfo } from "@/components/admin/AdminPanel";
import {
  communicationRecipientFilterLabel,
  communicationRecipientConfirmationStatusLabel,
  communicationRecipientSendStatusLabel,
  communicationRecipientSourceLabel,
  communicationStatusLabel,
  communicationTypeLabel,
} from "@/lib/communications/labels";
import { formatDateTimeDe } from "@/lib/format";
import type { CommunicationDetail } from "@/types/communication";

type CommunicationDetailViewProps = {
  communication: CommunicationDetail;
};

function isIncompleteRecipientStatus(status: string) {
  return status === "pending" || status === "sending";
}

export function CommunicationDetailView({
  communication,
}: CommunicationDetailViewProps) {
  const incompleteRecipients = communication.recipients.filter((recipient) =>
    isIncompleteRecipientStatus(recipient.sendStatus),
  );
  const pendingCount = communication.recipients.filter(
    (recipient) => recipient.sendStatus === "pending",
  ).length;
  const sendingCount = communication.recipients.filter(
    (recipient) => recipient.sendStatus === "sending",
  ).length;
  const confirmedCount = communication.recipients.filter(
    (recipient) => recipient.confirmedAt != null,
  ).length;

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
            label="Empfängerquelle"
            value={communicationRecipientSourceLabel(communication.recipientSource)}
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
          {communication.requireConfirmation ? (
            <AdminInfo
              label="Empfangsbestätigungen"
              value={`${confirmedCount} / ${communication.recipientCount} bestätigt`}
            />
          ) : null}
        </dl>
        {incompleteRecipients.length > 0 ? (
          <p className="mt-4 border border-line bg-surface px-4 py-3 text-[14px] leading-6 text-[#9a2b2b]">
            Versandstatus unvollständig ({pendingCount} ausstehend, {sendingCount}{" "}
            in Bearbeitung). Bitte prüfen, bevor erneut gesendet wird.
          </p>
        ) : null}
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
        title={`Empfänger (${communication.sentCount} versendet, ${communication.failedCount} fehlgeschlagen, ${incompleteRecipients.length} unvollständig / ${communication.recipientCount} gesamt)`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[14px]">
            <thead className="border-b border-line text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2">Verein</th>
                <th className="px-3 py-2">E-Mail</th>
                <th className="px-3 py-2">Quelle</th>
                <th className="px-3 py-2">Status</th>
                {communication.requireConfirmation ? (
                  <th className="px-3 py-2">Empfang</th>
                ) : null}
                <th className="px-3 py-2">Gesendet</th>
                <th className="px-3 py-2">Fehler</th>
              </tr>
            </thead>
            <tbody>
              {communication.recipients.map((recipient) => {
                const incomplete = isIncompleteRecipientStatus(recipient.sendStatus);

                return (
                  <tr
                    key={recipient.id}
                    className={`border-b border-line last:border-b-0 ${incomplete ? "bg-[#fff8f0]" : ""}`}
                  >
                    <td className="px-3 py-2 text-ink">{recipient.recipientTeamName}</td>
                    <td className="px-3 py-2 text-muted">
                      {recipient.recipientClubName ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">{recipient.recipientEmail}</td>
                    <td className="px-3 py-2 text-muted">
                      {recipient.teamDirectoryEntryId ? (
                        <Link
                          href={`/admin/team-datenbank/${recipient.teamDirectoryEntryId}`}
                          className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2"
                        >
                          Team-Datenbank
                        </Link>
                      ) : recipient.applicationId ? (
                        "Turnier-Bewerbung"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 ${incomplete ? "font-semibold text-[#9a2b2b]" : "text-muted"}`}
                    >
                      {communicationRecipientSendStatusLabel(recipient.sendStatus)}
                    </td>
                    {communication.requireConfirmation ? (
                      <td className="px-3 py-2 text-muted">
                        {communicationRecipientConfirmationStatusLabel(
                          recipient.confirmedAt,
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-muted">
                      {recipient.sentAt ? formatDateTimeDe(recipient.sentAt) : "—"}
                    </td>
                    <td className="px-3 py-2 text-[#9a2b2b]">
                      {recipient.errorMessage ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
