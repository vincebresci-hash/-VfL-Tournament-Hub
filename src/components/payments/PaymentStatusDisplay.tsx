import {
  paymentStatusClassName,
  paymentStatusClubMessage,
  paymentStatusLabel,
} from "@/lib/payments/labels";
import { formatCurrencyEur } from "@/lib/payments/format";
import type { ApplicationPayment } from "@/types/payment";

type PaymentStatusDisplayProps = {
  payment: ApplicationPayment;
};

export function PaymentStatusDisplay({ payment }: PaymentStatusDisplayProps) {
  return (
    <div className="border border-line bg-white p-5">
      <p className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        Zahlungsstatus
      </p>
      <div className="mt-3">
        <span
          className={`inline-flex px-2 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase ${paymentStatusClassName[payment.paymentStatus]}`}
        >
          {paymentStatusLabel[payment.paymentStatus]}
        </span>
      </div>
      <p className="mt-3 text-[14px] leading-6 text-ink">
        {paymentStatusClubMessage[payment.paymentStatus]}
      </p>
      {payment.participationFee != null ? (
        <p className="mt-2 text-[14px] text-muted">
          Startgebühr: {formatCurrencyEur(payment.participationFee)}
        </p>
      ) : null}
    </div>
  );
}

export function PaymentStatusBadge({ payment }: PaymentStatusDisplayProps) {
  return (
    <span
      className={`inline-flex px-2 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase ${paymentStatusClassName[payment.paymentStatus]}`}
    >
      {paymentStatusLabel[payment.paymentStatus]}
    </span>
  );
}
