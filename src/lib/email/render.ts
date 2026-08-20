import { applicationStatusLabel } from "@/lib/admin";
import { formatDateDe } from "@/lib/format";
import type { ClubApplicationView } from "@/types/club";
import type { EmailTemplateVariables } from "@/lib/email/types";

/**
 * Safe, central template renderer.
 *
 * Replaces `{{ placeholder }}` tokens with the matching value. Unknown
 * placeholders are replaced with an empty string and never throw, so a typo
 * in a template can never crash the email pipeline.
 */
export function renderTemplate(
  template: string,
  variables: Partial<Record<string, string>>,
): string {
  if (!template) {
    return "";
  }

  return template.replace(
    /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    (_match, rawKey: string) => {
      const key = rawKey.toLowerCase();
      const value = variables[key];
      return value === undefined || value === null ? "" : String(value);
    },
  );
}

/**
 * Builds the whitelisted set of placeholder values for an application.
 * Only known, non-sensitive fields are exposed to templates.
 */
export function buildApplicationEmailVariables(
  application: Pick<
    ClubApplicationView,
    | "contactFirstName"
    | "contactLastName"
    | "clubName"
    | "teamName"
    | "tournamentName"
    | "ageGroup"
    | "tournamentDate"
    | "tournamentLocation"
    | "applicationStatus"
  >,
): EmailTemplateVariables {
  const tournamentDate = application.tournamentDate
    ? safeFormatDate(application.tournamentDate)
    : "";

  return {
    contact_first_name: application.contactFirstName ?? "",
    contact_last_name: application.contactLastName ?? "",
    club_name: application.clubName ?? "",
    team_name: application.teamName ?? "",
    tournament_name: application.tournamentName ?? "",
    age_group: application.ageGroup ?? "",
    tournament_date: tournamentDate,
    location: application.tournamentLocation ?? "",
    application_status: applicationStatusLabel[application.applicationStatus] ??
      application.applicationStatus,
  };
}

function safeFormatDate(isoDate: string): string {
  try {
    return formatDateDe(isoDate);
  } catch {
    return isoDate;
  }
}

/**
 * Minimal, safe conversion of a plain-text template body into HTML so line
 * breaks are preserved in email clients. Escapes HTML special characters.
 */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? line : "&nbsp;"))
    .join("<br />");
}
