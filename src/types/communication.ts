export const COMMUNICATION_TYPES = [
  "tournament-info",
  "schedule",
  "important-change",
  "payment-reminder",
  "general",
] as const;

export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];

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
  applicationId: string;
  recipientEmail: string;
  recipientTeamName: string;
  recipientClubName: string | null;
};

export type CommunicationListItem = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentSlug: string;
  type: CommunicationType;
  subject: string;
  important: boolean;
  recipientFilter: CommunicationRecipientFilter;
  status: CommunicationStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
};

export type CommunicationRecipientDetail = {
  id: string;
  applicationId: string | null;
  recipientEmail: string;
  recipientTeamName: string;
  recipientClubName: string | null;
  sendStatus: CommunicationRecipientSendStatus;
  sentAt: string | null;
  errorMessage: string | null;
};

export type CommunicationDetail = CommunicationListItem & {
  body: string;
  recipients: CommunicationRecipientDetail[];
};

export type CommunicationComposeInput = {
  tournamentId: string;
  type: CommunicationType;
  recipientFilter: CommunicationRecipientFilter;
  applicationIds?: string[];
  subject: string;
  body: string;
  important: boolean;
  idempotencyKey: string;
};
