import { formatDateDe } from "@/lib/format";
import { AGE_GROUPS } from "@/types/tournament";
import type { AdminPaymentRecord, PaymentStatus } from "@/types/payment";

export type PaymentFilters = {
  query: string;
  tournamentId: "all" | string;
  ageGroup: "all" | string;
  paymentStatus: "all" | PaymentStatus;
};

export const emptyPaymentFilters: PaymentFilters = {
  query: "",
  tournamentId: "all",
  ageGroup: "all",
  paymentStatus: "all",
};

export type PaymentTournamentFilterOption = {
  id: string;
  label: string;
};

export function arePaymentFiltersActive(filters: PaymentFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.tournamentId !== "all" ||
    filters.ageGroup !== "all" ||
    filters.paymentStatus !== "all"
  );
}

export function filterPaymentRecords(
  records: readonly AdminPaymentRecord[],
  filters: PaymentFilters,
): AdminPaymentRecord[] {
  const query = filters.query.trim().toLowerCase();

  return records.filter((record) => {
    const tournamentMatch =
      filters.tournamentId === "all" || record.tournamentId === filters.tournamentId;
    const ageMatch =
      filters.ageGroup === "all" || record.ageGroup === filters.ageGroup;
    const statusMatch =
      filters.paymentStatus === "all" ||
      record.paymentStatus === filters.paymentStatus;
    const queryMatch =
      query.length === 0 ||
      record.clubName.toLowerCase().includes(query) ||
      record.teamName.toLowerCase().includes(query);

    return tournamentMatch && ageMatch && statusMatch && queryMatch;
  });
}

export function getPaymentTournamentFilterOptions(
  records: readonly AdminPaymentRecord[],
): PaymentTournamentFilterOption[] {
  const byId = new Map<string, AdminPaymentRecord>();

  for (const record of records) {
    if (!record.tournamentId || byId.has(record.tournamentId)) {
      continue;
    }
    byId.set(record.tournamentId, record);
  }

  const tournaments = [...byId.values()];
  const nameCounts = new Map<string, number>();
  for (const tournament of tournaments) {
    nameCounts.set(
      tournament.tournamentName,
      (nameCounts.get(tournament.tournamentName) ?? 0) + 1,
    );
  }

  return tournaments
    .map((tournament) => {
      const duplicateName = (nameCounts.get(tournament.tournamentName) ?? 0) > 1;
      const dateLabel =
        tournament.tournamentDate.trim().length > 0
          ? formatDateDe(tournament.tournamentDate)
          : null;
      const label =
        duplicateName && dateLabel
          ? `${tournament.tournamentName} (${dateLabel})`
          : tournament.tournamentName;

      return { id: tournament.tournamentId, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

export function getPaymentAgeGroupFilterOptions(
  records: readonly AdminPaymentRecord[],
): string[] {
  const present = new Set<string>();
  for (const record of records) {
    if (record.ageGroup) {
      present.add(record.ageGroup);
    }
  }

  const canonicalIndex = new Map(
    AGE_GROUPS.map((ageGroup, index) => [ageGroup, index]),
  );

  return [...present].sort((a, b) => {
    const aIndex = canonicalIndex.get(a as (typeof AGE_GROUPS)[number]);
    const bIndex = canonicalIndex.get(b as (typeof AGE_GROUPS)[number]);
    if (aIndex != null && bIndex != null) {
      return aIndex - bIndex;
    }
    if (aIndex != null) {
      return -1;
    }
    if (bIndex != null) {
      return 1;
    }
    return a.localeCompare(b, "de");
  });
}
