import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentStatusPanel } from "@/components/admin/PaymentStatusPanel";
import { AdminNotice, AdminPageHeader, displayValue } from "@/components/admin/AdminPanel";
import { formatDateDe } from "@/lib/format";
import { formatCurrencyEur } from "@/lib/payments/format";
import { paymentStatusLabel } from "@/lib/payments/labels";
import {
  canManagePaymentsAction,
  loadAdminPaymentRecordAction,
} from "@/lib/payments/actions";

export const metadata: Metadata = { title: "Zahlung" };

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminPaymentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [{ record, error }, canManage] = await Promise.all([
    loadAdminPaymentRecordAction(id),
    canManagePaymentsAction(),
  ]);

  if (error || !record) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/zahlungen"
        className="text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:text-brand-blue"
      >
        ← Alle Zahlungen
      </Link>

      <AdminPageHeader
        title={`${record.clubName} · ${record.teamName}`}
        description="Zahlungsbezogene Informationen ohne vollständige Bewerbungsverwaltung."
      />

      <div className="mt-8 grid gap-5">
        <section className="border border-line bg-white p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
            Zuordnung
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                Bewerbungs-ID
              </dt>
              <dd className="mt-1 text-[14px] text-ink">{record.applicationId}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                Turnier
              </dt>
              <dd className="mt-1 text-[14px] text-ink">{record.tournamentName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                Verein
              </dt>
              <dd className="mt-1 text-[14px] text-ink">{record.clubName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                Team
              </dt>
              <dd className="mt-1 text-[14px] text-ink">{record.teamName}</dd>
            </div>
          </dl>
        </section>

        {canManage ? (
          <PaymentStatusPanel
            applicationId={record.applicationId}
            applicationStatus={record.applicationStatus}
            payment={{
              paymentStatus: record.paymentStatus,
              participationFee: record.participationFee,
              paidAt: record.paidAt,
              paymentNote: record.paymentNote,
            }}
            canManage
          />
        ) : (
          <section className="border border-line bg-white p-5">
            <h2 className="font-display text-lg font-bold tracking-wide text-ink uppercase">
              Zahlungsstatus
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Status
                </dt>
                <dd className="mt-1 text-[14px] text-ink">
                  {paymentStatusLabel[record.paymentStatus]}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Startgebühr
                </dt>
                <dd className="mt-1 text-[14px] text-ink">
                  {record.participationFee != null
                    ? formatCurrencyEur(record.participationFee)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Bezahlt am
                </dt>
                <dd className="mt-1 text-[14px] text-ink">
                  {record.paidAt ? formatDateDe(record.paidAt.slice(0, 10)) : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-semibold tracking-[0.1em] text-ink/55 uppercase">
                  Interne Notiz
                </dt>
                <dd className="mt-1 text-[14px] text-ink">
                  {displayValue(record.paymentNote)}
                </dd>
              </div>
            </dl>
            <AdminNotice>
              Nur Lesezugriff. Änderungen erfordern die Berechtigung „Zahlungen verwalten“.
            </AdminNotice>
          </section>
        )}
      </div>
    </div>
  );
}
