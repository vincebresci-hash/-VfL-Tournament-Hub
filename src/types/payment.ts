export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "not_required",
  "waived",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type ApplicationPayment = {
  paymentStatus: PaymentStatus;
  participationFee: number | null;
  paidAt: string | null;
  paymentNote: string | null;
};
