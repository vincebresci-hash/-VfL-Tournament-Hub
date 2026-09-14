import Link from "next/link";
import {
  AdminEmpty,
  adminStatusBadgeClass,
  adminTextLinkClass,
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
      <div className="mt-8">
        <AdminEmpty>
          Keine angenommenen Bewerbungen mit Zahlungsdaten vorhanden.
        </AdminEmpty>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <p className="mb-4 text-[13px] text-muted">
        {records.length}{" "}
        {records.length === 1 ? "Zahlungseintrag" : "Zahlungseinträge"}
      </p>

      <div className="grid gap-3 lg:hidden">
        {records.map((record) => (
          <article
            key={`mobile-${record.applicationId}`}
            className="border border-line bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/zahlungen/${record.applicationId}`}
                  className="block truncate font-display text-lg font-bold tracking-wide text-navy uppercase hover:underline"
                >
                  {record.clubName}
                </Link>
                <p className="mt-1 truncate text-[13px] text-muted">{record.teamName}</p>
              </div>
              <span
                className={`shrink-0 ${adminStatusBadgeClass} ${paymentStatusClassName[record.paymentStatus]}`}
              >
                {paymentStatusLabel[record.paymentStatus]}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] text-muted">
              <div className="min-w-0 col-span-2">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Turnier
                </dt>
                <dd className="mt-1 truncate">{record.tournamentName}</dd>
                {record.tournamentDate ? (
                  <p className="mt-1 text-[12px]">{formatDateDe(record.tournamentDate)}</p>
                ) : null}
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Startgebühr
                </dt>
                <dd className="mt-1">
                  {record.participationFee != null
                    ? formatCurrencyEur(record.participationFee)
                    : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Bezahlt am
                </dt>
                <dd className="mt-1">
                  {record.paidAt ? formatDateDe(record.paidAt.slice(0, 10)) : "—"}
                </dd>
              </div>
            </dl>
            <Link
              href={`/admin/zahlungen/${record.applicationId}`}
              className={`${adminTextLinkClass} mt-4`}
            >
              Ansehen
            </Link>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto border border-line bg-white lg:block">
        <table className="min-w-full text-left text-[14px]">
          <thead className="border-b border-line bg-surface text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Verein / Team</th>
              <th className="px-4 py-3">Turnier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Startgebühr</th>
              <th className="px-4 py-3">Bezahlt am</th>
              <th className="px-4 py-3">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={`desktop-${record.applicationId}`}
                className="border-b border-line last:border-b-0 hover:bg-surface/70"
              >
                <td className="max-w-[200px] px-4 py-3">
                  <Link
                    href={`/admin/zahlungen/${record.applicationId}`}
                    className="block truncate font-medium text-navy hover:underline"
                  >
                    {record.clubName}
                  </Link>
                  <p className="truncate text-[13px] text-muted">{record.teamName}</p>
                </td>
                <td className="max-w-[200px] px-4 py-3 text-muted">
                  <p className="truncate">{record.tournamentName}</p>
                  {record.tournamentDate ? (
                    <p className="text-[12px]">{formatDateDe(record.tournamentDate)}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`${adminStatusBadgeClass} ${paymentStatusClassName[record.paymentStatus]}`}
                  >
                    {paymentStatusLabel[record.paymentStatus]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {record.participationFee != null
                    ? formatCurrencyEur(record.participationFee)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-muted">
                  {record.paidAt ? formatDateDe(record.paidAt.slice(0, 10)) : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/zahlungen/${record.applicationId}`}
                    className={adminTextLinkClass}
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
  );
}
