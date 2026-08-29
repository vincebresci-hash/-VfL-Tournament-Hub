import type { PaymentStatus } from "@/types/payment";

export function parseParticipationFeeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number.NaN;
  }

  return Math.round(parsed * 100) / 100;
}

export function normalizePaymentUpdate(input: {
  paymentStatus: PaymentStatus;
  participationFee: number | null;
  paidAt: string | null;
  existingPaidAt?: string | null;
}) {
  if (input.paymentStatus === "paid") {
    return {
      payment_status: input.paymentStatus,
      participation_fee: input.participationFee,
      paid_at:
        input.paidAt ??
        input.existingPaidAt ??
        new Date().toISOString(),
    };
  }

  return {
    payment_status: input.paymentStatus,
    participation_fee: input.participationFee,
    paid_at: null,
  };
}

export function normalizePaymentAdminNote(value: string | null | undefined) {
  return value?.trim() || null;
}
