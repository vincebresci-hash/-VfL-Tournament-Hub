import { isAuthError } from "@supabase/supabase-js";

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
  /\bBearer\s+\S+/gi,
];

export function redactInvitationSecrets(value: string) {
  let sanitized = value;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized;
}

export function buildInvitationRedirectUrl(siteUrl: string) {
  return `${siteUrl.replace(/\/$/, "")}/auth/callback`;
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
  if (lower.includes("redirect") || lower.includes("redirect_to")) {
    hint = `Redirect-URL nicht erlaubt. In Supabase unter Authentication → URL Configuration eintragen: ${redirectTo}`;
  } else if (lower.includes("already") || lower.includes("registered") || status === 422) {
    hint = "Diese E-Mail ist bereits in Supabase Auth registriert.";
  } else if (
    lower.includes("smtp") ||
    lower.includes("mail") ||
    lower.includes("email") ||
    lower.includes("535") ||
    lower.includes("sending invite")
  ) {
    hint =
      "Supabase konnte die Einladungs-E-Mail nicht senden. SMTP-Einstellungen und Auth-Logs in Supabase prüfen.";
  } else if (status === 401 || status === 403) {
    hint = "Service-Role-Zugriff auf Supabase Auth fehlgeschlagen (Schlüssel oder Projekt prüfen).";
  } else if (lower.includes("rate") || status === 429) {
    hint = "Supabase Auth Rate-Limit erreicht. Kurz warten und erneut versuchen.";
  }

  return {
    source: "supabase_auth_admin",
    status,
    code,
    message,
    hint,
  };
}

export function formatInvitationAuthFailure(
  diagnostic: InvitationAuthErrorDiagnostic,
  fallback = "Die Einladung konnte nicht versendet werden.",
) {
  const parts = [
    fallback,
    diagnostic.status ? `Auth-Status ${diagnostic.status}` : null,
    diagnostic.code ? `Code ${diagnostic.code}` : null,
    diagnostic.message !== "unknown_error" ? diagnostic.message : null,
    diagnostic.hint,
  ].filter(Boolean);

  return parts.join(" — ");
}
