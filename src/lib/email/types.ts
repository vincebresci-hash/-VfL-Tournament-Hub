export type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  replyTo?: string;
};

export type SendEmailResult = {
  ok: boolean;
  skipped?: boolean;
  provider: string;
  providerMessageId?: string | null;
  error?: string;
};
