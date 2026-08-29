import Link from "next/link";
import { paymentStatusLabel } from "@/lib/payments/labels";
import { formatDateDe } from "@/lib/format";
import { formatCurrencyEur } from "@/lib/payments/format";
import type { AdminPaymentRecord } from "@/types/payment";

type AdminPaymentsBoardProps = {
  records: AdminPaymentRecord[];
};

export function AdminPaymentsBoard({ records }: AdminPaymentsBoardProps) {
  if (records.length === 0) {
    return (
      <p className="mt-8 border border-line bg-white px-5 py-8 text-[15px] text-muted">
        Keine angenommenen Bewerbungen mit Zahlungsdaten vorhanden.
      </p>
    );
  }

  return (
    <div className="mt-8 overflow-x-auto border border-line bg-white">
      <table className="min-w-full text-left text-[14px]">
        <thead className="border-b border-line bg-background text-[11px] font-semibold tracking-[0.1em] text-ink/60 uppercase">
          <tr>
            <th className="px-4 py-3">Verein / Team</th>
            <th className="px-4 py-3">Turnier</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Startgebühr</th>
            <th className="px-4 py-3">Bezahlt am</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.applicationId} className="border-b border-line/70">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/zahlungen/${record.applicationId}`}
                  className="font-medium text-navy hover:underline"
                >
                  {record.clubName}
                </Link>
                <p className="text-[13px] text-muted">{record.teamName}</p>
              </td>
              <td className="px-4 py-3 text-muted">
                <p>{record.tournamentName}</p>
                {record.tournamentDate ? (
                  <p className="text-[12px]">{formatDateDe(record.tournamentDate)}</p>
                ) : null}
              </td>
              <td className="px-4 py-3">{paymentStatusLabel[record.paymentStatus]}</td>
              <td className="px-4 py-3 text-muted">
                {record.participationFee != null
                  ? formatCurrencyEur(record.participationFee)
                  : "—"}
              </td>
              <td className="px-4 py-3 text-muted">
                {record.paidAt ? formatDateDe(record.paidAt.slice(0, 10)) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
