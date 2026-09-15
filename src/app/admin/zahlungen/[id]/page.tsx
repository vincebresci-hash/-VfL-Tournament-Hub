import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentStatusPanel } from "@/components/admin/PaymentStatusPanel";
import {
  AdminCard,
  AdminInfo,
  AdminNotice,
  AdminPageHeader,
  adminIdentityHeroClass,
  adminTextLinkClass,
  displayValue,
} from "@/components/admin/AdminPanel";
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
        className={`${adminTextLinkClass} text-muted hover:text-brand-blue`}
      >
        ← Alle Zahlungen
      </Link>

      <div className={`mt-4 ${adminIdentityHeroClass}`}>
        <AdminPageHeader
          title={`${record.clubName} · ${record.teamName}`}
          description="Zahlungsbezogene Informationen ohne vollständige Bewerbungsverwaltung."
        />
      </div>

      <div className="mt-5 grid gap-4">
        <AdminCard title="Zuordnung">
          <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2">
            <AdminInfo label="Bewerbungs-ID" value={record.applicationId} />
            <AdminInfo label="Turnier" value={record.tournamentName} />
            <AdminInfo label="Verein" value={record.clubName} />
            <AdminInfo label="Team" value={record.teamName} />
          </dl>
        </AdminCard>

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
          <AdminCard title="Zahlungsstatus">
            <dl className="grid gap-x-5 gap-y-3.5 sm:grid-cols-2">
              <AdminInfo
                label="Status"
                value={paymentStatusLabel[record.paymentStatus]}
              />
              <AdminInfo
                label="Startgebühr"
                value={
                  record.participationFee != null
                    ? formatCurrencyEur(record.participationFee)
                    : "—"
                }
              />
              <AdminInfo
                label="Bezahlt am"
                value={
                  record.paidAt ? formatDateDe(record.paidAt.slice(0, 10)) : "—"
                }
              />
              <AdminInfo
                label="Interne Notiz"
                value={displayValue(record.paymentNote)}
              />
            </dl>
            <AdminNotice>
              Nur Lesezugriff. Änderungen erfordern die Berechtigung „Zahlungen
              verwalten“.
            </AdminNotice>
          </AdminCard>
        )}
      </div>
    </div>
  );
}
