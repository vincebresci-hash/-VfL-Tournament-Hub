import { Resend, type CreateEmailOptions } from "resend";
import { getEmailFrom, getResendApiKey } from "@/lib/email/config";
import type { EmailProvider } from "@/lib/email/provider";
import type { SendEmailInput, SendEmailResult } from "@/lib/email/types";

/**
 * Real email provider backed by Resend.
 *
 * Only ever instantiated on the server (see getEmailProvider). The API key is
 * read from the server-only RESEND_API_KEY variable and is never returned,
 * serialized, or logged.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly id = "resend";
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
    this.from = getEmailFrom();
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const html = input.html ?? undefined;
    const text = input.text ?? undefined;

    if (!html && !text) {
      return {
        ok: false,
        provider: this.id,
        error: "E-Mail ohne Inhalt kann nicht versendet werden.",
      };
    }

    // Resend requires at least one content field (html/text). We guarded
    // above that at least one exists, so this cast is safe.
    const payload = {
      from: this.from,
      to: input.to,
      subject: input.subject,
      replyTo: input.replyTo,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
    } as CreateEmailOptions;

    try {
      const { data, error } = await this.client.emails.send(payload);

      if (error) {
        return {
          ok: false,
          provider: this.id,
          error: sanitizeError(error),
        };
      }

      return {
        ok: true,
        provider: this.id,
        providerMessageId: data?.id ?? null,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        error: sanitizeError(error),
      };
    }
  }
}

/**
 * Factory that returns a Resend provider when a key is configured.
 * Returns null when no key is set so callers can fall back to Noop.
 */
export function createResendProviderIfConfigured(): ResendEmailProvider | null {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return null;
  }

  return new ResendEmailProvider(apiKey);
}

/**
 * Reduces an unknown error to a short, safe message. Never includes secrets.
 */
function sanitizeError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message.slice(0, 500);
    }
  }

  if (typeof error === "string" && error.length > 0) {
    return error.slice(0, 500);
  }

  return "Unbekannter Fehler beim E-Mail-Versand.";
}
