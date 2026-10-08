import type {
  CancellationRequestListItem,
  CancellationRequestStatus,
} from "@/types/cancellation";

export type CancellationArchiveTab = "active" | "archive";

export const cancellationRequestStatusLabel: Record<
  CancellationRequestStatus,
  string
> = {
  pending: "Offen",
  confirmed: "Bestätigt",
  rejected: "Abgelehnt",
};

export function isArchivedCancellationStatus(
  status: CancellationRequestStatus,
): boolean {
  return status === "confirmed" || status === "rejected";
}

export function partitionCancellationRequests(
  requests: readonly CancellationRequestListItem[],
): {
  active: CancellationRequestListItem[];
  archived: CancellationRequestListItem[];
} {
  const active: CancellationRequestListItem[] = [];
  const archived: CancellationRequestListItem[] = [];

  for (const request of requests) {
    if (request.status === "pending") {
      active.push(request);
    } else if (isArchivedCancellationStatus(request.status)) {
      archived.push(request);
    }
  }

  return { active, archived };
}

export function selectCancellationRequestsForTab(
  requests: readonly CancellationRequestListItem[],
  tab: CancellationArchiveTab,
): CancellationRequestListItem[] {
  const { active, archived } = partitionCancellationRequests(requests);
  return tab === "active" ? active : archived;
}
