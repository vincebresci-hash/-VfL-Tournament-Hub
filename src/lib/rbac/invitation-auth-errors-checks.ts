import {
  buildInvitationRedirectUrl,
  formatInvitationAuthFailure,
  redactInvitationSecrets,
  sanitizeInvitationAuthError,
} from "@/lib/rbac/invitation-auth-errors";
import { AuthApiError } from "@supabase/supabase-js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runInvitationAuthErrorChecks() {
  assert(
    buildInvitationRedirectUrl("https://vf-l-tournament-hub.vercel.app") ===
      "https://vf-l-tournament-hub.vercel.app/auth/callback",
    "invite redirect uses callback without query params",
  );
  assert(
    buildInvitationRedirectUrl("https://vf-l-tournament-hub.vercel.app/") ===
      "https://vf-l-tournament-hub.vercel.app/auth/callback",
    "invite redirect strips trailing slash",
  );

  const smtpDiagnostic = sanitizeInvitationAuthError(
    new AuthApiError("Error sending invite email", 500, "unexpected_failure"),
    "https://vf-l-tournament-hub.vercel.app/auth/callback",
  );
  assert(smtpDiagnostic.status === 500, "smtp diagnostic status");
  assert(
    smtpDiagnostic.hint.includes("SMTP"),
    "smtp diagnostic hint",
  );

  const redirectDiagnostic = sanitizeInvitationAuthError(
    new AuthApiError("redirect_to url is not allowed", 400, "validation_failed"),
    "https://example.com/auth/callback",
  );
  assert(redirectDiagnostic.hint.includes("Redirect-URL"), "redirect diagnostic hint");

  const formatted = formatInvitationAuthFailure(smtpDiagnostic);
  assert(formatted.includes("Error sending invite email"), "formatted message includes auth error");
  assert(!formatted.includes("sk_"), "formatted message redacts secrets");

  assert(
    redactInvitationSecrets("token sk_live_secret eyJabc.def.ghi") ===
      "token [redacted] [redacted]",
    "secret redaction",
  );

  return "ok";
}
