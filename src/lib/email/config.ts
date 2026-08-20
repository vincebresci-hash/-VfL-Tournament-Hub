/**
 * Central, server-only access to the email provider configuration.
 *
 * RESEND_API_KEY and EMAIL_FROM are read exclusively from server-side
 * environment variables. They are intentionally NOT prefixed with
 * `NEXT_PUBLIC_`, so Next.js never inlines them into the client bundle.
 *
 * Never log the raw key. Only expose booleans / non-secret values.
 */

const DEFAULT_EMAIL_FROM = "VfL Kirchheim Tournament Hub <onboarding@resend.dev>";

export function getResendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key ? key : null;
}

export function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM?.trim();
  return from ? from : DEFAULT_EMAIL_FROM;
}

/**
 * True when a real provider key is configured. When false the app falls back
 * to the Noop provider and simply records skipped email attempts.
 */
export function isEmailConfigured(): boolean {
  return getResendApiKey() !== null;
}
