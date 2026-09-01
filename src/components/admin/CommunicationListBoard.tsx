import Link from "next/link";
import { AdminEmpty } from "@/components/admin/AdminPanel";
import {
  communicationRecipientFilterLabel,
  communicationRecipientSourceLabel,
  communicationStatusLabel,
  communicationTypeLabel,
} from "@/lib/communications/labels";
import { formatDateTimeDe } from "@/lib/format";
import type { CommunicationListItem } from "@/types/communication";

type CommunicationListBoardProps = {
  communications: CommunicationListItem[];
};

export function CommunicationListBoard({
  communications,
}: CommunicationListBoardProps) {
  if (communications.length === 0) {
    return <AdminEmpty>Noch keine Kommunikationen versendet.</AdminEmpty>;
  }

  return (
    <div className="mt-8 overflow-x-auto border border-line bg-white">
      <table className="min-w-full text-left text-[14px]">
        <thead className="border-b border-line bg-surface text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          <tr>
            <th className="px-4 py-3">Betreff</th>
            <th className="px-4 py-3">Turnier</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Gesendet</th>
            <th className="px-4 py-3">Fehlgeschlagen</th>
            <th className="px-4 py-3">Empfang bestätigt</th>
            <th className="px-4 py-3">Datum</th>
          </tr>
        </thead>
        <tbody>
          {communications.map((item) => (
            <tr key={item.id} className="border-b border-line last:border-b-0">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/kommunikation/${item.id}`}
                  className="font-semibold text-ink underline decoration-brand-yellow underline-offset-2 hover:text-brand-blue"
                >
                  {item.subject}
                </Link>
                <p className="mt-1 text-[12px] text-muted">
                  {communicationTypeLabel(item.type)}
                  {item.important ? (
                    <span className="ml-2 text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase">
                      Wichtig
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {communicationRecipientSourceLabel(item.recipientSource)}
                  {item.recipientSource === "tournament-applications"
                    ? ` · ${communicationRecipientFilterLabel(item.recipientFilter)}`
                    : ""}
                </p>
              </td>
              <td className="px-4 py-3 text-ink">{item.tournamentName}</td>
              <td className="px-4 py-3 text-muted">
                {communicationStatusLabel(item.status)}
              </td>
              <td className="px-4 py-3 text-muted">{item.sentCount}</td>
              <td className="px-4 py-3 text-muted">
                {item.failedCount > 0 ? (
                  <span className="text-[#9a2b2b]">{item.failedCount}</span>
                ) : (
                  item.failedCount
                )}
              </td>
              <td className="px-4 py-3 text-muted">
                {item.requireConfirmation
                  ? `${item.confirmedCount} / ${item.recipientCount}`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-muted">
                {formatDateTimeDe(item.sentAt ?? item.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
