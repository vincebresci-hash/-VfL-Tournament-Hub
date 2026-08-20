import type { SendEmailInput, SendEmailResult } from "@/lib/email/types";
import { renderTemplate } from "@/lib/email/render";
import { createResendProviderIfConfigured } from "@/lib/email/resend-provider";

export type { SendEmailInput, SendEmailResult } from "@/lib/email/types";

export interface EmailProvider {
  readonly id: string;
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

/**
 * Fallback provider used when no RESEND_API_KEY is configured.
 * It never sends and marks the attempt as skipped so nothing breaks and the
 * delivery log still records that no provider was connected.
 */
export class NoopEmailProvider implements EmailProvider {
  readonly id = "noop";

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    void input;
    return {
      ok: false,
      skipped: true,
      provider: this.id,
      error: "E-Mail-Versand ist nicht konfiguriert (RESEND_API_KEY fehlt).",
    };
  }
}

/**
 * Returns the active email provider. Uses Resend when RESEND_API_KEY is set,
 * otherwise falls back to the Noop provider. Server-only: the provider reads
 * secrets from the server environment and must never be used in the browser.
 */
export function getEmailProvider(): EmailProvider {
  return createResendProviderIfConfigured() ?? new NoopEmailProvider();
}

/**
 * @deprecated Use `renderTemplate` from "@/lib/email/render" instead.
 * Kept for backwards compatibility.
 */
export function renderEmailTemplate(
  template: string,
  variables: Record<string, string>,
) {
  return renderTemplate(template, variables);
}
