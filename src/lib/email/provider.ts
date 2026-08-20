import type { SendEmailInput, SendEmailResult } from "@/lib/email/types";

export type { SendEmailInput, SendEmailResult } from "@/lib/email/types";

export interface EmailProvider {
  readonly id: string;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export class NoopEmailProvider implements EmailProvider {
  readonly id = "noop";

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    void input;
    return {
      ok: false,
      skipped: true,
      provider: this.id,
      error: "E-Mail-Versand ist noch nicht angebunden.",
    };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly id = "resend";

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM;

    if (!apiKey) {
      return {
        ok: false,
        skipped: true,
        provider: this.id,
        error: "RESEND_API_KEY fehlt.",
      };
    }

    if (!from) {
      return {
        ok: false,
        skipped: true,
        provider: this.id,
        error: "RESEND_FROM_EMAIL oder EMAIL_FROM fehlt.",
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          text: input.text ?? undefined,
          html: input.html ?? undefined,
          reply_to: input.replyTo ?? undefined,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        return {
          ok: false,
          provider: this.id,
          error:
            payload?.error?.message ??
            payload?.message ??
            `Resend-Fehler (${response.status}).`,
        };
      }

      return {
        ok: true,
        provider: this.id,
        providerMessageId: payload?.id ?? null,
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.id,
        error: error instanceof Error ? error.message : "E-Mail-Versand fehlgeschlagen.",
      };
    }
  }
}

export function getEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) {
    return new ResendEmailProvider();
  }

  return new NoopEmailProvider();
}

export function renderEmailTemplate(
  template: string,
  variables: Record<string, string>,
) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    return variables[key] ?? "";
  });
}

export function emailTextToHtml(text: string) {
  const escaped = text
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;");

  return `<div style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#10141c">${escaped}</div>`;
}
