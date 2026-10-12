export const INBOX_PROCESSING_STATUSES = ["open", "in_progress", "done"] as const;

export type InboxProcessingStatus = (typeof INBOX_PROCESSING_STATUSES)[number];

export type InboxAddress = {
  address: string;
  name: string;
};

export type InboxMessageListItem = {
  id: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  isUnreadLocal: boolean;
  processingStatus: InboxProcessingStatus;
  hasAttachments: boolean;
  uidvalidity: number;
};

export type InboxAttachmentItem = {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  stored: boolean;
  skipReason: string | null;
};

export type InboxMessageDetail = InboxMessageListItem & {
  toAddresses: InboxAddress[];
  ccAddresses: InboxAddress[];
  sentAt: string | null;
  bodyText: string | null;
  bodyHtmlSanitized: string | null;
  mailboxId: string;
  folder: string;
  imapUid: number;
  messageIdHeader: string | null;
  attachments: InboxAttachmentItem[];
};

export type InboxSyncStateView = {
  mailboxId: string;
  folder: string;
  uidvalidity: number | null;
  cursorUid: number;
  backfillComplete: boolean;
  backfillCutoffAt: string | null;
  lastSyncedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type ParsedInboxAttachment = {
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  contentId: string | null;
  content: Buffer | null;
  skipReason: string | null;
};

export type ParsedInboxMessage = {
  imapUid: number;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  threadKey: string;
  fromAddress: string;
  fromName: string;
  toAddresses: InboxAddress[];
  ccAddresses: InboxAddress[];
  subject: string;
  sentAt: string | null;
  receivedAt: string;
  snippet: string;
  bodyText: string | null;
  bodyHtmlSanitized: string | null;
  hasAttachments: boolean;
  sizeBytes: number | null;
  imapFlags: string[];
  attachments: ParsedInboxAttachment[];
};

export type InboxImapFetchItem = {
  uid: number;
  flags: string[];
  internalDate: Date | null;
  source: Buffer;
};

export type InboxImapFolderSnapshot = {
  folder: string;
  uidvalidity: number;
  uidnext: number;
  uids: number[];
};

export type InboxSyncBatchResult = {
  processed: number;
  stored: number;
  skippedLocked: boolean;
  backfillComplete: boolean;
  cursorUid: number;
  uidvalidity: number | null;
  error: string | null;
  timedOut: boolean;
};
