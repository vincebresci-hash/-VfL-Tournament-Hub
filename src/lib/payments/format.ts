export function formatCurrencyEur(amount: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatParticipationFeeInput(amount: number | null | undefined) {
  if (amount == null || Number.isNaN(amount)) {
    return "";
  }

  return amount.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPaidAtInput(iso: string | null | undefined) {
  if (!iso) {
    return "";
  }

  return iso.slice(0, 10);
}
