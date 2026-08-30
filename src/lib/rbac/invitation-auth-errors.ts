import { isAuthError } from "@supabase/supabase-js";

export const INVITATION_EMAIL_RATE_LIMIT_MESSAGE =
  "Das E-Mail-Limit für Einladungen wurde vorübergehend erreicht. Bitte versuche es später erneut.";

export type InvitationAuthErrorDiagnostic = {
  source: "supabase_auth_admin";
  status?: number;
  code?: string;
  message: string;
  hint: string;
};

const SECRET_PATTERNS = [
  /\bsk_[a-zA-Z0-9_]+/g,
  /\bsb_[a-zA-Z0-9_-]+/g,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  /\bre_[a-zA-Z0-9_]+/g,
  /\bBearer\s+\S+/gi,
];

export function redactInvitationSecrets(value: string) {
  let sanitized = value;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized;
}

import { CANONICAL_PRODUCTION_HOST, DEFAULT_PRODUCTION_SITE_URL } from "@/lib/site";

export const INVITE_PASSWORD_SETUP_PATH = "/passwort-zuruecksetzen";

export const CANONICAL_INVITE_REDIRECT_URL = `${DEFAULT_PRODUCTION_SITE_URL}/auth/callback?next=${encodeURIComponent(INVITE_PASSWORD_SETUP_PATH)}`;

export function buildInvitationRedirectUrl(siteUrl: string) {
  const base = `${siteUrl.replace(/\/$/, "")}/auth/callback`;
  const params = new URLSearchParams();
  params.set("next", INVITE_PASSWORD_SETUP_PATH);
  return `${base}?${params.toString()}`;
}

export function resolveInvitationRedirectTo(siteUrl: string) {
  const redirectTo = buildInvitationRedirectUrl(siteUrl);
  const hostname = new URL(redirectTo).hostname;

  if (process.env.VERCEL === "1" && hostname !== CANONICAL_PRODUCTION_HOST) {
    throw new Error(
      `invite redirect host must be ${CANONICAL_PRODUCTION_HOST}, got ${hostname}`,
    );
  }

  return redirectTo;
}

export function logInvitationRedirect(scope: string, redirectTo: string) {
  const hostname = new URL(redirectTo).hostname;
  console.info(`[${scope}] invite redirect`, {
    scope: "invitation_redirect",
    host: hostname,
    path: new URL(redirectTo).pathname,
    hasPasswordSetupNext: redirectTo.includes(`next=${encodeURIComponent(INVITE_PASSWORD_SETUP_PATH)}`),
  });
}

export function isInvitationEmailRateLimitError(error: unknown) {
  if (!isAuthError(error)) {
    return false;
  }

  if (error.status === 429) {
    return true;
  }

  const message = (error.message ?? "").toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests");
}

export function sanitizeInvitationAuthError(
  error: unknown,
  redirectTo: string,
): InvitationAuthErrorDiagnostic {
  const status = isAuthError(error) ? error.status : undefined;
  const code = isAuthError(error) ? error.code : undefined;
  const rawMessage =
    isAuthError(error) && error.message
      ? error.message
      : error instanceof Error
        ? error.message
        : "unknown_error";
  const message = redactInvitationSecrets(rawMessage);
  const lower = message.toLowerCase();

  let hint = "Unbekannter Supabase-Auth-Fehler.";
  if (isInvitationEmailRateLimitError(error)) {
    hint = "Supabase Auth E-Mail-Rate-Limit erreicht.";
  } else if (lower.includes("redirect") || lower.includes("redirect_to")) {
    hint = `Redirect-URL nicht erlaubt. In Supabase unter Authentication → URL Configuration eintragen: ${redirectTo}`;
  } else if (lower.includes("already") || lower.includes("registered") || status === 422) {
    hint = "Diese E-Mail ist bereits in Supabase Auth registriert.";
  } else if (
    lower.includes("smtp") ||
    lower.includes("535") ||
    lower.includes("sending invite")
  ) {
    hint =
      "Supabase konnte die Einladungs-E-Mail nicht senden. SMTP-Einstellungen und Auth-Logs in Supabase prüfen.";
  } else if (status === 401 || status === 403) {
    hint = "Service-Role-Zugriff auf Supabase Auth fehlgeschlagen (Schlüssel oder Projekt prüfen).";
  }

  return {
    source: "supabase_auth_admin",
    status,
    code,
    message,
    hint,
  };
}

export function resolveInvitationAuthUserMessage(
  error: unknown,
  options: { fallback: string },
) {
  if (!error) {
    return options.fallback;
  }

  if (isInvitationEmailRateLimitError(error)) {
    return INVITATION_EMAIL_RATE_LIMIT_MESSAGE;
  }

  const message = isAuthError(error) ? (error.message ?? "").toLowerCase() : "";
  if (message.includes("already") || (isAuthError(error) && error.status === 422)) {
    return "Diese E-Mail ist bereits registriert.";
  }

  return options.fallback;
}

export function logInvitationAuthFailure(
  scope: string,
  error: unknown,
  redirectTo: string,
) {
  const diagnostic = sanitizeInvitationAuthError(error, redirectTo);
  console.error(`[${scope}] Supabase Auth invite failed`, diagnostic);
}
