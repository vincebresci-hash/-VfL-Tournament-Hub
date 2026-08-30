import type { ApplicationStatus } from "@/types/application";
import type { CommunicationType } from "@/types/communication";
import type { PaymentStatus } from "@/types/payment";

export type CommunicationEligibleApplication = {
  id: string;
  status: ApplicationStatus;
  contactEmail: string;
  teamName: string;
  clubName: string | null;
  ageGroup: string | null;
  isHubTeam: boolean;
  paymentStatus: PaymentStatus | null;
  participationFee: number | null;
};

export type RecipientHubFilter = "all" | "hub" | "external";

export type RecipientPaymentFilter = "all" | "paid" | "pending";

export type RecipientPickerFilters = {
  status: ApplicationStatus | "all";
  ageGroup: string | "all";
  hub: RecipientHubFilter;
  payment: RecipientPaymentFilter;
  search: string;
};

export const DEFAULT_RECIPIENT_PICKER_FILTERS: RecipientPickerFilters = {
  status: "all",
  ageGroup: "all",
  hub: "all",
  payment: "all",
  search: "",
};

export type CommunicationRecipientPreviewRow = {
  applicationId: string;
  recipientEmail: string;
  recipientTeamName: string;
  recipientClubName: string | null;
};

export function isHubApplication(application: Pick<CommunicationEligibleApplication, "isHubTeam">) {
  return application.isHubTeam;
}

export function isApplicationSelectableForCommunication(
  application: CommunicationEligibleApplication,
  type: CommunicationType,
): boolean {
  if (!application.contactEmail.trim()) {
    return false;
  }

  if (application.status === "cancelled" || application.status === "rejected") {
    return false;
  }

  if (type === "payment-reminder") {
    return (
      application.status === "accepted" &&
      application.paymentStatus === "pending" &&
      application.participationFee != null
    );
  }

  return application.status === "accepted" || application.status === "waiting-list";
}

export function matchesRecipientPickerFilters(
  application: CommunicationEligibleApplication,
  filters: RecipientPickerFilters,
): boolean {
  if (filters.status !== "all" && application.status !== filters.status) {
    return false;
  }

  if (filters.ageGroup !== "all" && application.ageGroup !== filters.ageGroup) {
    return false;
  }

  if (filters.hub === "hub" && !application.isHubTeam) {
    return false;
  }

  if (filters.hub === "external" && application.isHubTeam) {
    return false;
  }

  if (filters.payment === "paid" && application.paymentStatus !== "paid") {
    return false;
  }

  if (filters.payment === "pending" && application.paymentStatus !== "pending") {
    return false;
  }

  const query = filters.search.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    application.teamName,
    application.clubName ?? "",
    application.contactEmail,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function filterVisibleRecipientApplications(
  applications: CommunicationEligibleApplication[],
  filters: RecipientPickerFilters,
): CommunicationEligibleApplication[] {
  return applications.filter((application) =>
    matchesRecipientPickerFilters(application, filters),
  );
}

export function collectUniqueAgeGroups(applications: CommunicationEligibleApplication[]) {
  return [...new Set(applications.map((item) => item.ageGroup).filter(Boolean))].sort(
    (left, right) => String(left).localeCompare(String(right), "de"),
  ) as string[];
}

export function deduplicateRecipientsByEmail(
  recipients: CommunicationRecipientPreviewRow[],
): CommunicationRecipientPreviewRow[] {
  const seen = new Set<string>();
  const unique: CommunicationRecipientPreviewRow[] = [];

  for (const recipient of recipients) {
    const normalized = recipient.recipientEmail.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(recipient);
  }

  return unique;
}

export function summarizeRecipientPreview(recipients: CommunicationRecipientPreviewRow[]) {
  const uniqueRecipients = deduplicateRecipientsByEmail(recipients);

  return {
    teamCount: recipients.length,
    uniqueEmailCount: uniqueRecipients.length,
    uniqueRecipients,
  };
}
