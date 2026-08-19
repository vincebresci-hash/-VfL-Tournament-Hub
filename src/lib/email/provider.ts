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

/**
 * Later: return ResendEmailProvider when RESEND_API_KEY is set.
 * Never expose provider secrets to the browser.
 */
export function getEmailProvider(): EmailProvider {
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
