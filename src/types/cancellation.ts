export const CANCELLATION_REQUEST_STATUSES = ["pending", "confirmed", "rejected"] as const;

export type CancellationRequestStatus = (typeof CANCELLATION_REQUEST_STATUSES)[number];

export const CANCELLATION_REQUESTED_BY_TYPES = ["club", "external"] as const;

export type CancellationRequestedByType = (typeof CANCELLATION_REQUESTED_BY_TYPES)[number];

export const SECURE_ACCESS_TOKEN_PURPOSES = [
  "cancellation",
  "communication_confirm",
] as const;

export type SecureAccessTokenPurpose = (typeof SECURE_ACCESS_TOKEN_PURPOSES)[number];

export type CancellationRequest = {
  id: string;
  applicationId: string;
  requestedByType: CancellationRequestedByType;
  reason: string | null;
  isLateRequest: boolean;
  status: CancellationRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CancellationRequestListItem = CancellationRequest & {
  tournamentName: string;
  tournamentSlug: string;
  tournamentDate: string;
  clubName: string;
  teamName: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  applicationStatus: string;
  daysUntilTournament: number | null;
};

import type { ApplicationPayment } from "@/types/payment";

export type ParticipationPortalView = {
  tokenId: string;
  applicationId: string;
  tournamentName: string;
  teamName: string;
  tournamentDate: string;
  daysUntilTournament: number | null;
  isLateRequestWindow: boolean;
  hasPendingRequest: boolean;
} & ApplicationPayment;
