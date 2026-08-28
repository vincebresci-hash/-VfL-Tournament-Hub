import { PAYMENT_STATUSES, type ApplicationPayment, type PaymentStatus } from "@/types/payment";

export function asPaymentStatus(value: string | null | undefined): PaymentStatus {
  if (value && PAYMENT_STATUSES.includes(value as PaymentStatus)) {
    return value as PaymentStatus;
  }

  return "pending";
}

export function toApplicationPayment(row: {
  payment_status?: string | null;
  participation_fee?: number | string | null;
  paid_at?: string | null;
  payment_note?: string | null;
}): ApplicationPayment {
  const feeValue = row.participation_fee;
  const participationFee =
    feeValue == null || feeValue === ""
      ? null
      : typeof feeValue === "number"
        ? feeValue
        : Number(feeValue);

  return {
    paymentStatus: asPaymentStatus(row.payment_status),
    participationFee:
      participationFee == null || Number.isNaN(participationFee)
        ? null
        : participationFee,
    paidAt: row.paid_at ?? null,
    paymentNote: row.payment_note ?? null,
  };
}
