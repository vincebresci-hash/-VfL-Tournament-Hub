import type { PaymentStatus } from "@/types/payment";

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  pending: "Zahlung offen",
  paid: "Bezahlt",
  not_required: "Keine Zahlung erforderlich",
  waived: "Erlassen",
};

export const paymentStatusClassName: Record<PaymentStatus, string> = {
  pending: "bg-[#fff4d6] text-[#7a5b00]",
  paid: "bg-[#e6f4ea] text-[#1f6b3a]",
  not_required: "bg-surface text-muted",
  waived: "bg-[#eef2ff] text-[#3347a8]",
};

export const paymentStatusClubMessage: Record<PaymentStatus, string> = {
  pending: "Zahlung noch offen",
  paid: "Zahlung eingegangen",
  not_required: "Keine Zahlung erforderlich",
  waived: "Zahlung erlassen",
};

export const paymentStatusAdminOptions: Array<{
  value: PaymentStatus;
  label: string;
}> = [
  { value: "pending", label: "Zahlung offen" },
  { value: "paid", label: "Bezahlt" },
  { value: "not_required", label: "Keine Zahlung erforderlich" },
  { value: "waived", label: "Erlassen" },
];
