import Link from "next/link";
import {
  AdminEmpty,
  adminCompactSecondaryButtonClass,
  adminMobileCardClass,
  adminStatusBadgeClass,
  adminTableHeaderBarClass,
  adminTableRowHoverClass,
  adminTableShellClass,
} from "@/components/admin/AdminPanel";
import {
  communicationAdminStatusHint,
  communicationAdminStatusLabel,
} from "@/lib/communications/interrupted-communication";
import {
  communicationRecipientFilterLabel,
  communicationRecipientSourceLabel,
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
    <div className="mt-5">
      <p className="mb-3 text-[13px] text-muted">
        {communications.length}{" "}
        {communications.length === 1 ? "Kommunikation" : "Kommunikationen"}
      </p>

      <div className="grid gap-2.5 lg:hidden">
        {communications.map((item) => {
          const statusHint = communicationAdminStatusHint(item);

          return (
            <article key={`mobile-${item.id}`} className={adminMobileCardClass}>
              <div className="min-w-0">
                <Link
                  href={`/admin/kommunikation/${item.id}`}
                  className="block truncate font-display text-[15px] font-bold tracking-wide text-navy uppercase hover:underline"
                >
                  {item.subject}
                </Link>
                <p className="mt-0.5 text-[12px] text-muted">
                  {communicationTypeLabel(item.type)}
                  {item.important ? (
                    <span className="ml-2 text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase">
                      Wichtig
                    </span>
                  ) : null}
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
                <div className="min-w-0 col-span-2">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                    Turnier
                  </dt>
                  <dd className="mt-0.5 truncate text-ink">{item.tournamentName}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                    Status
                  </dt>
                  <dd className="mt-0.5">
                    <span className={`${adminStatusBadgeClass} bg-surface text-ink`}>
                      {communicationAdminStatusLabel(item)}
                    </span>
                    {statusHint ? (
                      <p className="mt-1 text-[12px] text-muted">{statusHint}</p>
                    ) : null}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                    Datum
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    {formatDateTimeDe(item.sentAt ?? item.createdAt)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                    Gesendet / Fehlgeschlagen
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    {item.sentCount}
                    {" / "}
                    {item.failedCount > 0 ? (
                      <span className="text-[#9a2b2b]">{item.failedCount}</span>
                    ) : (
                      item.failedCount
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                    Empfang bestätigt
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    {item.requireConfirmation
                      ? `${item.confirmedCount} / ${item.recipientCount}`
                      : "—"}
                  </dd>
                </div>
                <div className="min-w-0 col-span-2">
                  <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                    Empfänger
                  </dt>
                  <dd className="mt-0.5 text-muted">
                    {communicationRecipientSourceLabel(item.recipientSource)}
                    {item.recipientSource === "tournament-applications"
                      ? ` · ${communicationRecipientFilterLabel(item.recipientFilter)}`
                      : ""}
                  </dd>
                </div>
              </dl>
              <Link
                href={`/admin/kommunikation/${item.id}`}
                className={`${adminCompactSecondaryButtonClass} mt-3`}
              >
                Ansehen
              </Link>
            </article>
          );
        })}
      </div>

      <div className={adminTableShellClass}>
        <div className={adminTableHeaderBarClass}>
          <p>Kommunikationen</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-[13px]">
            <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="w-[28%] px-3.5 py-2.5">Betreff</th>
                <th className="w-[18%] px-3.5 py-2.5">Turnier</th>
                <th className="w-[14%] px-3.5 py-2.5">Status</th>
                <th className="w-[8%] px-3.5 py-2.5">Gesendet</th>
                <th className="w-[10%] px-3.5 py-2.5">Fehlgeschlagen</th>
                <th className="w-[12%] px-3.5 py-2.5">Empfang bestätigt</th>
                <th className="w-[10%] px-3.5 py-2.5">Datum</th>
              </tr>
            </thead>
            <tbody>
              {communications.map((item) => {
                const statusHint = communicationAdminStatusHint(item);

                return (
                  <tr key={`desktop-${item.id}`} className={adminTableRowHoverClass}>
                    <td className="min-w-0 px-3.5 py-2.5">
                      <Link
                        href={`/admin/kommunikation/${item.id}`}
                        className="block truncate text-[14px] font-semibold text-navy hover:underline"
                      >
                        {item.subject}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {communicationTypeLabel(item.type)}
                        {item.important ? (
                          <span className="ml-2 text-[11px] font-semibold tracking-[0.08em] text-[#9a2b2b] uppercase">
                            Wichtig
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {communicationRecipientSourceLabel(item.recipientSource)}
                        {item.recipientSource === "tournament-applications"
                          ? ` · ${communicationRecipientFilterLabel(item.recipientFilter)}`
                          : ""}
                      </p>
                    </td>
                    <td className="min-w-0 px-3.5 py-2.5 text-ink">
                      <span className="block truncate">{item.tournamentName}</span>
                    </td>
                    <td className="px-3.5 py-2.5 text-muted">
                      <span>{communicationAdminStatusLabel(item)}</span>
                      {statusHint ? (
                        <p className="mt-0.5 text-[12px] text-muted">{statusHint}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                      {item.sentCount}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                      {item.failedCount > 0 ? (
                        <span className="text-[#9a2b2b]">{item.failedCount}</span>
                      ) : (
                        item.failedCount
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                      {item.requireConfirmation
                        ? `${item.confirmedCount} / ${item.recipientCount}`
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                      {formatDateTimeDe(item.sentAt ?? item.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
