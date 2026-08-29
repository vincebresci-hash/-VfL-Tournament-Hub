import {
  INVITATION_EMAIL_RATE_LIMIT_MESSAGE,
  buildInvitationRedirectUrl,
  isInvitationEmailRateLimitError,
  logInvitationAuthFailure,
  redactInvitationSecrets,
  resolveInvitationAuthUserMessage,
  sanitizeInvitationAuthError,
} from "@/lib/rbac/invitation-auth-errors";
import { AuthApiError } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function readInvitationActions() {
  return readFileSync(join(process.cwd(), "src/lib/rbac/invitation-actions.ts"), "utf8");
}

export function runInvitationAuthErrorChecks() {
  const actions = readInvitationActions();

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

  const rateLimitError = new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit");
  assert(isInvitationEmailRateLimitError(rateLimitError), "429 rate limit detection");
  assert(
    resolveInvitationAuthUserMessage(rateLimitError, {
      fallback: "Die Einladung konnte nicht versendet werden.",
    }) === INVITATION_EMAIL_RATE_LIMIT_MESSAGE,
    "429 user-facing message",
  );
  assert(
    !resolveInvitationAuthUserMessage(rateLimitError, {
      fallback: "Die Einladung konnte nicht versendet werden.",
    }).includes("429"),
    "429 message hides status code",
  );

  const smtpDiagnostic = sanitizeInvitationAuthError(
    new AuthApiError("Error sending invite email", 500, "unexpected_failure"),
    "https://vf-l-tournament-hub.vercel.app/auth/callback",
  );
  assert(smtpDiagnostic.status === 500, "smtp diagnostic status");
  assert(smtpDiagnostic.hint.includes("SMTP"), "smtp diagnostic hint");

  const redirectDiagnostic = sanitizeInvitationAuthError(
    new AuthApiError("redirect_to url is not allowed", 400, "validation_failed"),
    "https://example.com/auth/callback",
  );
  assert(redirectDiagnostic.hint.includes("Redirect-URL"), "redirect diagnostic hint");

  assert(
    resolveInvitationAuthUserMessage(
      new AuthApiError("User already registered", 422, "email_exists"),
      { fallback: "Die Einladung konnte nicht versendet werden." },
    ) === "Diese E-Mail ist bereits registriert.",
    "existing user message",
  );

  assert(
    redactInvitationSecrets("token sk_live_secret re_abc123 eyJabc.def.ghi") ===
      "token [redacted] [redacted] [redacted]",
    "secret redaction",
  );

  assert(
    !actions.includes("inviteData?.user?.id)") ||
      !actions.includes("cleanupPendingAuthUser(service, inviteData.user.id)"),
    "no auth-user cleanup on inviteUserByEmail error",
  );
  assert(actions.includes("logInvitationAuthFailure"), "server-side invite auth logging");
  assert(actions.includes("resolveInvitationAuthUserMessage"), "user-facing invite auth messages");
  assert(actions.includes("requireSuperAdminSession"), "invite super admin only");

  let loggedDiagnostic: unknown;
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    loggedDiagnostic = args[1];
  };
  try {
    logInvitationAuthFailure(
      "test",
      rateLimitError,
      "https://vf-l-tournament-hub.vercel.app/auth/callback",
    );
  } finally {
    console.error = originalError;
  }
  assert(
    typeof loggedDiagnostic === "object" &&
      loggedDiagnostic !== null &&
      "status" in loggedDiagnostic &&
      (loggedDiagnostic as { status?: number }).status === 429,
    "rate limit logged server-side",
  );

  return "ok";
}
