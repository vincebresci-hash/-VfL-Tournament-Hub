import "server-only";

import type { InboxSmtpConfig } from "@/lib/inbox/smtp-config";
import {
  INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS,
  INBOX_SMTP_CONNECTION_TIMEOUT_MS,
  INBOX_SMTP_SEND_TIMEOUT_MS,
  INBOX_SMTP_SOCKET_TIMEOUT_MS,
} from "@/lib/inbox/reply-attachment-runtime";

export {
  INBOX_SMTP_CONNECTION_TIMEOUT_MS,
  INBOX_SMTP_SEND_TIMEOUT_MS,
  INBOX_SMTP_SOCKET_TIMEOUT_MS,
};

export type InboxSmtpAttachmentInput = {
  filename: string;
  contentType: string;
  /** Raw bytes — never logged. */
  content: Buffer;
};

export type InboxSmtpMailInput = {
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: ReadonlyArray<InboxSmtpAttachmentInput>;
};

export type InboxSmtpSendResult =
  | {
      outcome: "sent";
      response: string | null;
    }
  | {
      outcome: "failed";
      error: string;
      response: string | null;
    }
  | {
      /** Timeout / disconnect after TLS — caller must mark uncertain; never auto-resend. */
      outcome: "uncertain";
      error: string;
      response: string | null;
    };

type NodemailerTransport = {
  sendMail: (options: Record<string, unknown>) => Promise<{
    messageId?: string;
    response?: string;
  }>;
  close: () => void;
};

type NodemailerModule = {
  createTransport: (options: Record<string, unknown>) => NodemailerTransport;
};

async function loadNodemailer(): Promise<NodemailerModule> {
  const mod = (await import("nodemailer")) as NodemailerModule & {
    default?: NodemailerModule;
  };
  if (typeof mod.createTransport === "function") {
    return mod;
  }
  if (mod.default && typeof mod.default.createTransport === "function") {
    return mod.default;
  }
  throw new Error("nodemailer createTransport unavailable");
}

function formatFrom(config: InboxSmtpConfig): string {
  if (config.fromName) {
    const safeName = config.fromName.replace(/[\r\n"<>]/g, "").trim();
    if (safeName) {
      return `"${safeName}" <${config.fromAddress}>`;
    }
  }
  return config.fromAddress;
}

function isTlsFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as { code?: string; message?: string };
  const code = (err.code ?? "").toUpperCase();
  const message = (err.message ?? "").toLowerCase();
  if (
    code === "ESOCKET" &&
    (message.includes("ssl") || message.includes("tls") || message.includes("cert"))
  ) {
    return true;
  }
  if (code === "EPROTO" || code === "ERR_TLS_CERT_ALTNAME_INVALID" || code === "CERT_HAS_EXPIRED") {
    return true;
  }
  if (
    message.includes("certificate") ||
    message.includes("ssl") ||
    message.includes("tls") ||
    message.includes("self signed") ||
    message.includes("unable to verify") ||
    message.includes("alert handshake")
  ) {
    return true;
  }
  return false;
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  // TLS failures are clear configuration/transport failures — fail closed as failed.
  if (isTlsFailure(error)) {
    return false;
  }
  const err = error as { code?: string; message?: string; name?: string };
  const code = (err.code ?? "").toUpperCase();
  const message = (err.message ?? "").toLowerCase();
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "EABORT") {
    return true;
  }
  if (code === "ESOCKET" && !isTlsFailure(error)) {
    return true;
  }
  if (err.name === "AbortError") {
    return true;
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection closed") ||
    message.includes("connection ended")
  ) {
    return true;
  }
  return false;
}

export function safeSmtpErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
      .replace(/pass(word)?[=:]\s*\S+/gi, "password=[redacted]")
      .replace(/auth[^,\s]*/gi, "auth=[redacted]")
      .slice(0, 400);
  }
  return "SMTP-Versand fehlgeschlagen.";
}

/**
 * Send one plain-text reply via IONOS SMTP.
 * TLS is required; certificate verification fails closed.
 * Does not retry. Caller owns idempotency + uncertain handling.
 *
 * Timeouts are bounded below {@link INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS}.
 */
export async function sendInboxSmtpMail(
  config: InboxSmtpConfig,
  mail: InboxSmtpMailInput,
): Promise<InboxSmtpSendResult> {
  let transport: NodemailerTransport | null = null;

  // Static assert: SMTP race must leave headroom under the segment deadline.
  if (INBOX_SMTP_SEND_TIMEOUT_MS >= INBOX_REPLY_DEPLOYMENT_MAX_DURATION_SECONDS * 1000) {
    return {
      outcome: "failed",
      error: "SMTP-Zeitbudget ist falsch konfiguriert.",
      response: null,
    };
  }

  try {
    const nodemailer = await loadNodemailer();
    transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      tls: {
        // Fail closed: never accept invalid certificates.
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      },
      auth: {
        user: config.user,
        pass: config.password,
      },
      connectionTimeout: INBOX_SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: INBOX_SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: INBOX_SMTP_SOCKET_TIMEOUT_MS,
      logger: false,
      debug: false,
    });

    const headers: Record<string, string> = {};
    if (mail.inReplyTo) {
      headers["In-Reply-To"] = mail.inReplyTo;
    }
    if (mail.references) {
      headers.References = mail.references;
    }

    const attachments =
      mail.attachments?.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content,
        contentDisposition: "attachment" as const,
      })) ?? undefined;

    const sendPromise = transport.sendMail({
      from: formatFrom(config),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      messageId: mail.messageId.startsWith("<") ? mail.messageId : `<${mail.messageId}>`,
      headers,
      attachments,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error("SMTP send timed out");
        error.name = "AbortError";
        reject(error);
      }, INBOX_SMTP_SEND_TIMEOUT_MS);
      if (typeof timer === "object" && "unref" in timer) {
        (timer as NodeJS.Timeout).unref();
      }
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);
    return {
      outcome: "sent",
      response: typeof info.response === "string" ? info.response.slice(0, 500) : null,
    };
  } catch (error) {
    const message = safeSmtpErrorMessage(error);
    if (isTlsFailure(error)) {
      return {
        outcome: "failed",
        error: `TLS-Fehler: ${message}`,
        response: null,
      };
    }
    if (isTimeoutLikeError(error)) {
      return {
        outcome: "uncertain",
        error: message,
        response: null,
      };
    }
    return {
      outcome: "failed",
      error: message,
      response: null,
    };
  } finally {
    try {
      transport?.close();
    } catch {
      // ignore teardown errors
    }
  }
}
