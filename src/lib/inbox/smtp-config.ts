import "server-only";

import { messageIdDomainFromEmail } from "@/lib/inbox/reply-validation";

export { messageIdDomainFromEmail };

/**
 * IONOS SMTP configuration — server-only.
 * Never import from client components. Never log password values.
 * From address must be explicit (no IMAP-user fallback).
 */

export type InboxSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  /** When true, STARTTLS is required (submission ports). */
  requireTls: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName: string | null;
  /** Verified domain derived from fromAddress for Message-ID generation. */
  messageIdDomain: string;
};

export function readInboxSmtpConfig(): InboxSmtpConfig | null {
  const host = process.env.INBOX_SMTP_HOST?.trim();
  const user = process.env.INBOX_SMTP_USER?.trim();
  const password = process.env.INBOX_SMTP_PASSWORD;
  const fromAddress = process.env.INBOX_SMTP_FROM?.trim() || "";
  const fromName = process.env.INBOX_SMTP_FROM_NAME?.trim() || null;
  const portRaw = process.env.INBOX_SMTP_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 465;

  if (!host || !user || !password || !fromAddress || !Number.isFinite(port)) {
    return null;
  }

  const messageIdDomain = messageIdDomainFromEmail(fromAddress);
  if (!messageIdDomain) {
    return null;
  }

  const secureEnv = process.env.INBOX_SMTP_SECURE?.trim();
  const secure = secureEnv == null || secureEnv === "" ? port === 465 : secureEnv !== "false";
  // Fail closed: always require TLS (implicit on 465, STARTTLS otherwise).
  const requireTls = !secure;

  return {
    host,
    port,
    secure,
    requireTls,
    user,
    password,
    fromAddress,
    fromName: fromName || null,
    messageIdDomain,
  };
}

/** Safe summary for diagnostics — never includes password. */
export function describeInboxSmtpConfig(config: InboxSmtpConfig | null): {
  configured: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  requireTls?: boolean;
  userPresent?: boolean;
  fromAddress?: string;
  messageIdDomain?: string;
} {
  if (!config) {
    return { configured: false };
  }
  return {
    configured: true,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTls: config.requireTls,
    userPresent: Boolean(config.user),
    fromAddress: config.fromAddress,
    messageIdDomain: config.messageIdDomain,
  };
}
