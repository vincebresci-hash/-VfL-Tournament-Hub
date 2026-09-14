import Link from "next/link";
import {
  AdminEmpty,
  adminCardShellClass,
  adminCompactSecondaryButtonClass,
  adminStatusBadgeClass,
} from "@/components/admin/AdminPanel";
import { paymentStatusClassName, paymentStatusLabel } from "@/lib/payments/labels";
import { formatDateDe } from "@/lib/format";
import { formatCurrencyEur } from "@/lib/payments/format";
import type { AdminPaymentRecord } from "@/types/payment";

type AdminPaymentsBoardProps = {
  records: AdminPaymentRecord[];
};

export function AdminPaymentsBoard({ records }: AdminPaymentsBoardProps) {
  if (records.length === 0) {
    return (
      <div className="mt-5">
        <AdminEmpty>
          Keine angenommenen Bewerbungen mit Zahlungsdaten vorhanden.
        </AdminEmpty>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <p className="text-[13px] text-muted">
          {records.length}{" "}
          {records.length === 1 ? "Zahlungseintrag" : "Zahlungseinträge"}
        </p>
      </div>

      <div className="grid gap-2.5 lg:hidden">
        {records.map((record) => (
          <article
            key={`mobile-${record.applicationId}`}
            className={`${adminCardShellClass} border-l-4 border-l-navy/15 p-3.5`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/zahlungen/${record.applicationId}`}
                  className="block truncate font-display text-[15px] font-bold tracking-wide text-navy uppercase hover:underline"
                >
                  {record.clubName}
                </Link>
                <p className="mt-0.5 truncate text-[13px] font-medium text-ink">
                  {record.teamName}
                </p>
              </div>
              <span
                className={`shrink-0 ${adminStatusBadgeClass} ${paymentStatusClassName[record.paymentStatus]}`}
              >
                {paymentStatusLabel[record.paymentStatus]}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2.5 text-[13px]">
              <div className="min-w-0 col-span-2">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Turnier
                </dt>
                <dd className="mt-0.5 truncate font-medium text-ink">
                  {record.tournamentName}
                </dd>
                {record.tournamentDate ? (
                  <p className="mt-0.5 text-[12px] text-muted">
                    {formatDateDe(record.tournamentDate)}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Startgebühr
                </dt>
                <dd className="mt-0.5 text-ink">
                  {record.participationFee != null
                    ? formatCurrencyEur(record.participationFee)
                    : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Bezahlt am
                </dt>
                <dd className="mt-0.5 text-muted">
                  {record.paidAt ? formatDateDe(record.paidAt.slice(0, 10)) : "—"}
                </dd>
              </div>
            </dl>
            <Link
              href={`/admin/zahlungen/${record.applicationId}`}
              className={`${adminCompactSecondaryButtonClass} mt-3`}
            >
              Ansehen
            </Link>
          </article>
        ))}
      </div>

      <div className={`hidden overflow-hidden ${adminCardShellClass} lg:block`}>
        <div className="border-b border-line bg-surface/70 px-4 py-2.5">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Zahlungseinträge
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left text-[13px]">
            <thead className="border-b border-line bg-white text-[10px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="w-[32%] px-3.5 py-2.5">Verein / Team</th>
                <th className="w-[28%] px-3.5 py-2.5">Turnier</th>
                <th className="w-[12%] px-3.5 py-2.5">Status</th>
                <th className="w-[10%] px-3.5 py-2.5">Startgebühr</th>
                <th className="w-[10%] px-3.5 py-2.5">Bezahlt am</th>
                <th className="w-[8%] px-3.5 py-2.5">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={`desktop-${record.applicationId}`}
                  className="border-b border-line/70 last:border-b-0 transition-colors hover:bg-surface/70"
                >
                  <td className="px-3.5 py-2.5">
                    <Link
                      href={`/admin/zahlungen/${record.applicationId}`}
                      className="block truncate text-[14px] font-semibold text-navy hover:underline"
                    >
                      {record.clubName}
                    </Link>
                    <p className="truncate text-[12px] text-muted">{record.teamName}</p>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <p className="truncate font-medium text-ink">{record.tournamentName}</p>
                    {record.tournamentDate ? (
                      <p className="text-[12px] text-muted">
                        {formatDateDe(record.tournamentDate)}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <span
                      className={`${adminStatusBadgeClass} ${paymentStatusClassName[record.paymentStatus]}`}
                    >
                      {paymentStatusLabel[record.paymentStatus]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-ink">
                    {record.participationFee != null
                      ? formatCurrencyEur(record.participationFee)
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                    {record.paidAt ? formatDateDe(record.paidAt.slice(0, 10)) : "—"}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Link
                      href={`/admin/zahlungen/${record.applicationId}`}
                      className={adminCompactSecondaryButtonClass}
                    >
                      Ansehen
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
