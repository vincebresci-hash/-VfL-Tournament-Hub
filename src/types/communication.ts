export const COMMUNICATION_TYPES = [
  "tournament-info",
  "schedule",
  "important-change",
  "payment-reminder",
  "general",
] as const;

export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

export const COMMUNICATION_RECIPIENT_SOURCES = [
  "tournament-applications",
  "team-directory",
] as const;

export type CommunicationRecipientSource =
  (typeof COMMUNICATION_RECIPIENT_SOURCES)[number];

export const COMMUNICATION_RECIPIENT_FILTERS = [
  "accepted",
  "payment-paid",
  "payment-pending",
  "waitlist",
  "custom",
] as const;

export type CommunicationRecipientFilter =
  (typeof COMMUNICATION_RECIPIENT_FILTERS)[number];

export const COMMUNICATION_STATUSES = [
  "draft",
  "sending",
  "sent",
  "partially_sent",
  "failed",
  "cancelled",
] as const;

export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export const COMMUNICATION_RECIPIENT_SEND_STATUSES = [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
] as const;

export type CommunicationRecipientSendStatus =
  (typeof COMMUNICATION_RECIPIENT_SEND_STATUSES)[number];

export type CommunicationRecipientPreview = {
  applicationId: string | null;
  teamDirectoryEntryId: string | null;
  recipientEmail: string;
  recipientTeamName: string;
  recipientClubName: string | null;
  recipientContactFirstName: string | null;
};

export type CommunicationListItem = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  recipientSource: CommunicationRecipientSource;
  type: CommunicationType;
  subject: string;
  important: boolean;
  requireConfirmation: boolean;
  recipientFilter: CommunicationRecipientFilter;
  status: CommunicationStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  confirmedCount: number;
  createdAt: string;
  sentAt: string | null;
};

export type CommunicationRecipientDetail = {
  id: string;
  applicationId: string | null;
  teamDirectoryEntryId: string | null;
  recipientEmail: string;
  recipientTeamName: string;
  recipientClubName: string | null;
  sendStatus: CommunicationRecipientSendStatus;
  sentAt: string | null;
  confirmedAt: string | null;
  errorMessage: string | null;
};

export type CommunicationDetail = CommunicationListItem & {
  body: string;
  recipients: CommunicationRecipientDetail[];
};

export type CommunicationComposeInput = {
  tournamentId: string;
  recipientSource: CommunicationRecipientSource;
  type: CommunicationType;
  recipientFilter: CommunicationRecipientFilter;
  applicationIds?: string[];
  teamDirectoryEntryIds?: string[];
  subject: string;
  body: string;
  important: boolean;
  requireConfirmation: boolean;
  idempotencyKey: string;
};

export type CommunicationReceiptView = {
  subject: string;
  body: string;
  tournamentName: string;
  teamName: string;
  confirmedAt: string | null;
};
