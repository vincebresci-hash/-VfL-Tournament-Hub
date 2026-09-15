"use client";

import { useState } from "react";
import { TextAreaInput } from "@/components/apply/FormControls";
import {
  adminCardShellClass,
  adminFilterControlClass,
  adminPrimaryButtonClass,
  adminSectionTitleClass,
} from "@/components/admin/AdminPanel";
import { updateApplicationPaymentAction } from "@/lib/payments/actions";
import {
  formatCurrencyEur,
  formatPaidAtInput,
  formatParticipationFeeInput,
} from "@/lib/payments/format";
import { paymentStatusAdminOptions } from "@/lib/payments/labels";
import type { ApplicationPayment, PaymentStatus } from "@/types/payment";

type PaymentStatusPanelProps = {
  applicationId: string;
  applicationStatus: string;
  payment: ApplicationPayment;
  canManage?: boolean;
};

export function PaymentStatusPanel({
  applicationId,
  applicationStatus,
  payment,
  canManage = true,
}: PaymentStatusPanelProps) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    payment.paymentStatus,
  );
  const [participationFeeInput, setParticipationFeeInput] = useState(
    formatParticipationFeeInput(payment.participationFee),
  );
  const [paidAtInput, setPaidAtInput] = useState(formatPaidAtInput(payment.paidAt));
  const [paymentNote, setPaymentNote] = useState(payment.paymentNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (applicationStatus !== "accepted") {
    return null;
  }

  if (!canManage) {
    return (
      <section className={`${adminCardShellClass} p-4 sm:p-5`}>
        <h2 className={adminSectionTitleClass}>Zahlungsstatus</h2>
        <p className="mt-3 text-[14px] text-muted">
          Status: {paymentStatusAdminOptions.find((o) => o.value === payment.paymentStatus)?.label}
        </p>
        {payment.participationFee != null ? (
          <p className="mt-2 text-[14px] text-muted">
            Startgebühr: {formatCurrencyEur(payment.participationFee)}
          </p>
        ) : null}
        {payment.paidAt ? (
          <p className="mt-2 text-[14px] text-muted">
            Bezahlt am: {formatPaidAtInput(payment.paidAt)}
          </p>
        ) : null}
        {payment.paymentNote ? (
          <p className="mt-2 text-[14px] text-muted">Notiz: {payment.paymentNote}</p>
        ) : null}
      </section>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    const result = await updateApplicationPaymentAction({
      applicationId,
      paymentStatus,
      participationFeeInput,
      paidAtInput,
      paymentNote,
    });

    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setNotice(result.notice ?? "Zahlungsstatus gespeichert.");
  }

  return (
    <section className={`${adminCardShellClass} p-4 sm:p-5`}>
      <h2 className={adminSectionTitleClass}>Zahlungsstatus</h2>
      <p className="mt-2 text-[12px] leading-5 text-muted">
        Die Teilnahme bleibt angenommen. Der Zahlungsstatus beeinflusst weder
        Kapazität noch Warteliste.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="payment-status"
            className="text-[10px] font-semibold tracking-[0.08em] text-ink/50 uppercase"
          >
            Zahlungsstatus
          </label>
          <select
            id="payment-status"
            value={paymentStatus}
            onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}
            className={`mt-1.5 ${adminFilterControlClass}`}
          >
            {paymentStatusAdminOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="participation-fee"
            className="text-[10px] font-semibold tracking-[0.08em] text-ink/50 uppercase"
          >
            Startgebühr (EUR)
          </label>
          <input
            id="participation-fee"
            inputMode="decimal"
            value={participationFeeInput}
            onChange={(event) => setParticipationFeeInput(event.target.value)}
            placeholder="z. B. 100,00"
            className={`mt-1.5 ${adminFilterControlClass}`}
          />
          {payment.participationFee != null ? (
            <p className="mt-2 text-[12px] text-muted">
              Aktuell: {formatCurrencyEur(payment.participationFee)}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="paid-at"
            className="text-[10px] font-semibold tracking-[0.08em] text-ink/50 uppercase"
          >
            Bezahlt am
          </label>
          <input
            id="paid-at"
            type="date"
            value={paidAtInput}
            onChange={(event) => setPaidAtInput(event.target.value)}
            className={`mt-1.5 ${adminFilterControlClass}`}
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="payment-note"
            className="text-[10px] font-semibold tracking-[0.08em] text-ink/50 uppercase"
          >
            Notiz
          </label>
          <div className="mt-1.5">
            <TextAreaInput
              id="payment-note"
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              placeholder="Optionale interne Notiz zur Zahlung"
            />
          </div>
        </div>

        {error ? (
          <p className="text-[13px] text-[#9a2b2b] sm:col-span-2" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-[13px] text-ink sm:col-span-2" role="status">
            {notice}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className={adminPrimaryButtonClass}
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </form>
    </section>
  );
}
