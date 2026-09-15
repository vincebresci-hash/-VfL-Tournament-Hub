import Link from "next/link";
import {
  AdminCard,
  AdminInfo,
  adminCardShellClass,
  adminIdentityHeroClass,
  adminMobileCardClass,
  adminTableRowHoverClass,
  adminTextLinkClass,
} from "@/components/admin/AdminPanel";
import {
  communicationAdminStatusLabel,
  INTERRUPTED_COMMUNICATION_DETAIL_WARNING,
  isInterruptedCommunication,
} from "@/lib/communications/interrupted-communication";
import {
  communicationRecipientFilterLabel,
  communicationRecipientConfirmationStatusLabel,
  communicationRecipientSendStatusLabel,
  communicationRecipientSourceLabel,
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
  const interrupted = isInterruptedCommunication(communication);

  return (
    <div className="mt-5 grid gap-4">
      <div className={adminIdentityHeroClass}>
        <p className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
          Kommunikation
        </p>
        <h1 className="mt-2 truncate font-display text-2xl font-bold tracking-wide text-ink uppercase sm:text-3xl">
          {communication.subject}
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          {communication.tournamentName} ·{" "}
          {communicationTypeLabel(communication.type)}
          {communication.important ? " · Wichtig" : ""}
        </p>
        <p className="mt-2 text-[13px] text-muted">
          {communicationAdminStatusLabel(communication)} ·{" "}
          {formatDateTimeDe(communication.sentAt ?? communication.createdAt)}
        </p>
      </div>

      {interrupted ? (
        <p
          className={`${adminCardShellClass} border-amber-200 bg-amber-50 px-4 py-3.5 text-[14px] text-amber-950`}
        >
          {INTERRUPTED_COMMUNICATION_DETAIL_WARNING}
        </p>
      ) : null}

      <AdminCard title="Nachricht">
        <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
            value={communicationAdminStatusLabel(communication)}
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
        {interrupted ? null : incompleteRecipients.length > 0 ? (
          <p
            className={`mt-4 ${adminMobileCardClass} text-[14px] leading-6 text-[#9a2b2b]`}
          >
            Versandstatus unvollständig ({pendingCount} ausstehend, {sendingCount}{" "}
            in Bearbeitung). Bitte prüfen, bevor erneut gesendet wird.
          </p>
        ) : null}
        <div className={`mt-5 rounded-lg border border-line/70 bg-surface/60 px-4 py-4`}>
          <p className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">
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
        <div className="overflow-x-auto rounded-lg border border-line/70">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-line bg-surface/70 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="px-3.5 py-2.5">Team</th>
                <th className="px-3.5 py-2.5">Verein</th>
                <th className="px-3.5 py-2.5">E-Mail</th>
                <th className="px-3.5 py-2.5">Quelle</th>
                <th className="px-3.5 py-2.5">Status</th>
                {communication.requireConfirmation ? (
                  <th className="px-3.5 py-2.5">Empfang</th>
                ) : null}
                <th className="px-3.5 py-2.5">Gesendet</th>
                <th className="px-3.5 py-2.5">Fehler</th>
              </tr>
            </thead>
            <tbody>
              {communication.recipients.map((recipient) => {
                const incomplete = isIncompleteRecipientStatus(recipient.sendStatus);

                return (
                  <tr
                    key={recipient.id}
                    className={`${adminTableRowHoverClass} ${incomplete ? "bg-[#fff8f0]" : ""}`}
                  >
                    <td className="px-3.5 py-2.5 text-ink">
                      {recipient.recipientTeamName}
                    </td>
                    <td className="px-3.5 py-2.5 text-muted">
                      {recipient.recipientClubName ?? "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-muted">
                      {recipient.recipientEmail}
                    </td>
                    <td className="px-3.5 py-2.5 text-muted">
                      {recipient.teamDirectoryEntryId ? (
                        <Link
                          href={`/admin/team-datenbank/${recipient.teamDirectoryEntryId}`}
                          className={`${adminTextLinkClass} h-auto text-[13px] tracking-normal normal-case text-ink underline decoration-brand-yellow underline-offset-2`}
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
                      className={`px-3.5 py-2.5 ${incomplete ? "font-semibold text-[#9a2b2b]" : "text-muted"}`}
                    >
                      {communicationRecipientSendStatusLabel(recipient.sendStatus)}
                    </td>
                    {communication.requireConfirmation ? (
                      <td className="px-3.5 py-2.5 text-muted">
                        {communicationRecipientConfirmationStatusLabel(
                          recipient.confirmedAt,
                        )}
                      </td>
                    ) : null}
                    <td className="px-3.5 py-2.5 text-muted">
                      {recipient.sentAt ? formatDateTimeDe(recipient.sentAt) : "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-[#9a2b2b]">
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
