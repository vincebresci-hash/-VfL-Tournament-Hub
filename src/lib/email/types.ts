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

/**
 * Whitelisted placeholders that may appear in email templates.
 * Unknown placeholders are rendered as an empty string and never throw.
 */
export type EmailTemplateVariables = {
  contact_first_name: string;
  contact_last_name: string;
  club_name: string;
  team_name: string;
  tournament_name: string;
  age_group: string;
  tournament_date: string;
  location: string;
  application_status: string;
};

export type EmailLogStatus = "pending" | "sent" | "failed";

/**
 * Result of an attempt to send an application-related email.
 * Never contains provider secrets. Safe to log server-side.
 */
export type ApplicationEmailOutcome = {
  attempted: boolean;
  ok: boolean;
  skipped: boolean;
  reason?: string;
};
